/**
 * Tests for the status command logic.
 *
 * @remarks
 * Mocks service discovery and HTTP probes to verify all display paths:
 * healthy, HTTP errors, unreachable, and non-JSON bodies. Every platform
 * component is always probed.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import { init, resetInit } from '../../init.js';
import { useTempDir } from '../../test/tempDir.js';

vi.mock('../../plugin/http.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../discovery/getServiceUrl.js', () => ({
  getServiceUrl: vi.fn((name: string) => `http://svc/${name}`),
}));

import { fetchWithTimeout } from '../../plugin/http.js';

type Probe = Partial<Response> | Error;

/** Route probes by component name; unlisted components are down. */
function mockProbes(probes: Record<string, Probe>): void {
  vi.mocked(fetchWithTimeout).mockImplementation((url: string) => {
    const name = /http:\/\/svc\/(\w+)\/status/.exec(url)?.[1] ?? '';
    const probe = probes[name] ?? new Error('ECONNREFUSED');
    return probe instanceof Error
      ? Promise.reject(probe)
      : Promise.resolve(probe as Response);
  });
}

const healthy = (version: string): Probe => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ version }),
});

describe('registerStatusCommand', () => {
  let testDir: string;
  let configDir: string;
  let consoleSpy: MockInstance;
  let originalExitCode: typeof process.exitCode;

  const tempDir = useTempDir('jeeves-status-test-');
  beforeEach(() => {
    testDir = tempDir();
    configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-core'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    resetInit();
    consoleSpy.mockRestore();
    process.exitCode = originalExitCode;
    vi.mocked(fetchWithTimeout).mockReset();
  });

  async function runStatus(): Promise<string> {
    const { registerStatusCommand } = await import('./statusCommand.js');
    const { Command } = await import('@commander-js/extra-typings');
    const program = new Command();
    registerStatusCommand(program);
    await program.parseAsync([
      'node',
      'jeeves',
      'status',
      '-w',
      join(testDir, 'workspace'),
      '-c',
      configDir,
      '-t',
      '3000',
    ]);
    return consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
  }

  it('reports all components healthy with versions and memory hygiene', async () => {
    mockProbes({
      runner: healthy('1.0.0'),
      watcher: healthy('1.2.3'),
      server: healthy('3.0.0'),
      meta: healthy('0.9.0'),
    });

    const output = await runStatus();
    for (const [name, version] of [
      ['runner', '1.0.0'],
      ['watcher', '1.2.3'],
      ['server', '3.0.0'],
      ['meta', '0.9.0'],
    ]) {
      expect(output).toMatch(
        new RegExp(
          `^${name} +✅ Running +${version.replace(/\./g, '\\.')}`,
          'm',
        ),
      );
    }
    expect(output).toContain('MEMORY.md not found.');
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    [500, 'Chars: 500 / 1000 (50%) — ✅ OK'],
    [850, 'Chars: 850 / 1000 (85%) — ⚠ Warning'],
    [1200, 'Chars: 1200 / 1000 (120%) — ❌ Over budget'],
  ])(
    'reports MEMORY.md with %i chars against the budget',
    async (chars, line) => {
      const saved = process.env['JEEVES_MEMORY_BUDGET'];
      process.env['JEEVES_MEMORY_BUDGET'] = '1000';
      try {
        mkdirSync(join(testDir, 'workspace'), { recursive: true });
        writeFileSync(
          join(testDir, 'workspace', 'MEMORY.md'),
          'x'.repeat(chars),
        );
        mockProbes({
          runner: healthy('1'),
          watcher: healthy('1'),
          server: healthy('1'),
          meta: healthy('1'),
        });
        const output = await runStatus();
        expect(output).toContain(line);
        // Memory hygiene never affects the exit code.
        expect(process.exitCode).toBeUndefined();
      } finally {
        if (saved === undefined)
          Reflect.deleteProperty(process.env, 'JEEVES_MEMORY_BUDGET');
        else process.env['JEEVES_MEMORY_BUDGET'] = saved;
      }
    },
  );

  it('shows HTTP error status on non-OK response', async () => {
    mockProbes({
      runner: { ok: false, status: 503 },
      watcher: healthy('1'),
      server: healthy('1'),
      meta: healthy('1'),
    });
    const output = await runStatus();
    expect(output).toMatch(/^runner +❌ HTTP 503 +—/m);
    expect(process.exitCode).toBe(1);
  });

  it('shows Down when a probe throws', async () => {
    mockProbes({ watcher: healthy('1') });
    const output = await runStatus();
    expect(output).toMatch(/^watcher +✅ Running/m);
    for (const name of ['runner', 'server', 'meta']) {
      expect(output).toMatch(new RegExp(`^${name} +❌ Down +—`, 'm'));
    }
    expect(process.exitCode).toBe(1);
  });

  it('handles a non-JSON response body gracefully', async () => {
    const nonJson: Probe = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    };
    mockProbes({
      runner: nonJson,
      watcher: nonJson,
      server: nonJson,
      meta: nonJson,
    });
    const output = await runStatus();
    expect(output).toContain('Running');
    expect(output).toContain('\u2014');
    expect(process.exitCode).toBeUndefined();
  });
}, 15_000);
