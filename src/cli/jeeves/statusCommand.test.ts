/**
 * Tests for the status command logic.
 *
 * @remarks
 * Tests the status command by mocking service discovery and HTTP probes
 * to verify all display paths: healthy, HTTP errors, unreachable, and
 * no registered components.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

import { COMPONENT_VERSIONS_FILE } from '../../constants/paths.js';
import { init, resetInit } from '../../init.js';

vi.mock('../../plugin/http.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../discovery/getServiceUrl.js', () => ({
  getServiceUrl: vi.fn(),
}));

import { getServiceUrl } from '../../discovery/getServiceUrl.js';
import { fetchWithTimeout } from '../../plugin/http.js';

describe('registerStatusCommand', () => {
  let testDir: string;
  let configDir: string;
  let coreConfigDir: string;
  let consoleSpy: MockInstance;
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-status-test-${String(Date.now())}`);
    configDir = join(testDir, 'config');
    coreConfigDir = join(configDir, 'jeeves-core');
    mkdirSync(coreConfigDir, { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
    consoleSpy.mockRestore();
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  async function runStatusAction(timeoutMs = 3000): Promise<void> {
    // Dynamically import to pick up vi.mock
    const { registerStatusCommand } = await import('./statusCommand.js');
    const { Command } = await import('@commander-js/extra-typings');

    const program = new Command();
    registerStatusCommand(program);

    // Parse with explicit args to trigger the status action
    await program.parseAsync([
      'node',
      'jeeves',
      'status',
      '-w',
      join(testDir, 'workspace'),
      '-c',
      configDir,
      '-t',
      String(timeoutMs),
    ]);
  }

  function writeVersions(versions: Record<string, unknown>): void {
    writeFileSync(
      join(coreConfigDir, COMPONENT_VERSIONS_FILE),
      JSON.stringify(versions, null, 2),
      'utf-8',
    );
  }

  it('prints "No components registered" when versions file is empty', async () => {
    writeVersions({});

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('No components registered');
    expect(process.exitCode).toBeUndefined();
  });

  it('shows healthy status when service responds OK with version', async () => {
    writeVersions({
      watcher: { pluginVersion: '0.2.0', updatedAt: new Date().toISOString() },
    });

    vi.mocked(getServiceUrl).mockReturnValue('http://127.0.0.1:1936');
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ version: '1.2.3' }),
    } as unknown as Response);

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('watcher');
    expect(output).toContain('Running');
    expect(output).toContain('1.2.3');
    expect(process.exitCode).toBeUndefined();
  });

  it('shows HTTP error status on non-OK response', async () => {
    writeVersions({
      runner: { pluginVersion: '0.1.0', updatedAt: new Date().toISOString() },
    });

    vi.mocked(getServiceUrl).mockReturnValue('http://127.0.0.1:1937');
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('runner');
    expect(output).toContain('503');
    expect(process.exitCode).toBe(1);
  });

  it('shows Down status when fetch throws', async () => {
    writeVersions({
      watcher: { pluginVersion: '0.2.0', updatedAt: new Date().toISOString() },
    });

    vi.mocked(getServiceUrl).mockReturnValue('http://127.0.0.1:1936');
    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('ECONNREFUSED'));

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('watcher');
    expect(output).toContain('Down');
    expect(process.exitCode).toBe(1);
  });

  it('handles non-JSON response body gracefully', async () => {
    writeVersions({
      meta: { pluginVersion: '0.1.0', updatedAt: new Date().toISOString() },
    });

    vi.mocked(getServiceUrl).mockReturnValue('http://127.0.0.1:1938');
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('meta');
    expect(output).toContain('Running');
    // Version should be the default dash
    expect(output).toContain('\u2014');
    expect(process.exitCode).toBeUndefined();
  });

  it('sets exitCode 1 when at least one component is unhealthy', async () => {
    writeVersions({
      watcher: { pluginVersion: '0.2.0', updatedAt: new Date().toISOString() },
      runner: { pluginVersion: '0.1.0', updatedAt: new Date().toISOString() },
    });

    vi.mocked(getServiceUrl).mockImplementation((name: string) => {
      if (name === 'watcher') return 'http://127.0.0.1:1936';
      return 'http://127.0.0.1:1937';
    });

    // watcher healthy, runner down
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ version: '1.0.0' }),
      } as unknown as Response)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await runStatusAction();

    const output = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('Running');
    expect(output).toContain('Down');
    expect(process.exitCode).toBe(1);
  });
}, 15_000);
