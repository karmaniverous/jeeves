/**
 * Tests for `jeeves install` wiring: plugin config precedence end to end,
 * fail-before-write on missing required config, secret redaction in output.
 * Child processes are faked; no OpenClaw is touched.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerInstallCommand } from './installCommand.js';
import { MissingPluginConfigError } from './plugins/pluginConfigResolve.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import type * as SecretsModule from './plugins/secrets.js';
import {
  type FakeRunner,
  fakeRunner,
  type FakeTempFiles,
  fakeTempFiles,
  ok,
} from './plugins/testRunner.js';
import type { PluginWorkflowDeps } from './plugins/workflows.js';

const SEED = 'c0ffee'.repeat(10) + 'c0ff';
const S = 'jeeves-server-openclaw';

const state = vi.hoisted(() => ({
  fake: undefined as FakeRunner | undefined,
  temp: undefined as FakeTempFiles | undefined,
}));

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean): PluginWorkflowDeps => ({
      runner: (cmd, args, opts) => {
        if (!state.fake) throw new Error('no fake runner');
        return state.fake.runner(cmd, args, opts);
      },
      fs: {
        isDirectory: () => false,
        readPackageName: () => undefined,
        removeDir: () => undefined,
      },
      tempFiles: {
        makePrivateDir: () => state.temp?.files.makePrivateDir() ?? '',
        restrictDir: (d) =>
          state.temp?.files.restrictDir(d) ?? Promise.resolve(undefined),
        writeNewFile: (p, t) => state.temp?.files.writeNewFile(p, t),
        removeDir: (d) => state.temp?.files.removeDir(d),
      },
      configDir: '/oc',
      log: (line) => {
        console.log(line);
      },
      dryRun,
    }),
  };
});

vi.mock('./plugins/secrets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SecretsModule>()),
  generatePluginKey: () => SEED,
}));

describe('jeeves install (plugin config)', () => {
  let dir: string;
  let ws: string;
  let out: string[];
  let savedRoot: string | undefined;

  beforeEach(() => {
    dir = join(
      tmpdir(),
      `jeeves-install-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    ws = join(dir, 'ws');
    mkdirSync(ws, { recursive: true });
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
    savedRoot = process.env['JEEVES_CONFIG_ROOT'];
    delete process.env['JEEVES_CONFIG_ROOT'];
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok('{}'),
      'openclaw plugins inspect --all --json': ok('[]'),
      [`npm view @karmaniverous/${S}`]: ok('"0.14.0"'),
      [`npm view @karmaniverous/${S}@0.14.0 jeeves.conversationHooks`]: ok(
        '["before_prompt_build"]',
      ),
    });
    state.temp = fakeTempFiles();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedRoot !== undefined) process.env['JEEVES_CONFIG_ROOT'] = savedRoot;
    rmSync(dir, { recursive: true, force: true });
  });

  const run = async (...args: string[]) => {
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    await program.parseAsync(['install', 'server', '-w', ws, ...args], {
      from: 'user',
    });
  };
  const batch = (): unknown => state.temp?.batch();

  it('fails before writing any content when configRoot is missing', async () => {
    await expect(run()).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(false);
    expect(
      state.fake?.lines().some((l) => / plugins install /.test(` ${l} `)),
    ).toBe(false);
  });

  it('writes --config-root and defaults, redacting the generated key', async () => {
    const cfg = join(dir, 'cfg');
    await run('-c', cfg);
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(true);
    expect(batch()).toEqual([
      {
        path: `plugins.entries.${S}.hooks.allowConversationAccess`,
        value: true,
      },
      { path: `plugins.entries.${S}.config.configRoot`, value: resolve(cfg) },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
      { path: `plugins.entries.${S}.config.pluginKey`, value: SEED },
    ]);
    const printed = out.join('\n');
    expect(printed).not.toContain(SEED);
    expect(state.fake?.lines().join('\n')).not.toContain(SEED);
    expect(printed).toContain('keys._plugin');
    expect(printed).toContain('Restart the gateway');
  });

  it("uses the server's keys._plugin and a --plugin-config file", async () => {
    const cfg = join(dir, 'cfg');
    mkdirSync(join(cfg, 'jeeves-server'), { recursive: true });
    writeFileSync(
      join(cfg, 'jeeves-server', 'config.json'),
      JSON.stringify({ keys: { _plugin: 'server-seed' } }),
    );
    const file = join(dir, 'plugins.json');
    writeFileSync(
      file,
      JSON.stringify({
        configRoot: cfg,
        server: { apiUrl: 'http://127.0.0.1:9999' },
      }),
    );
    await run(
      '--plugin-config',
      file,
      '--server-api-url',
      'http://127.0.0.1:1934',
      '--dry-run',
    );
    expect(state.fake?.lines().some((l) => l.includes(' config set '))).toBe(
      false,
    );
    const printed = out.join('\n');
    expect(printed).toContain(
      `${S}.apiUrl = "http://127.0.0.1:1934" (option; write)`,
    );
    expect(printed).toContain(
      `${S}.configRoot = ${JSON.stringify(resolve(cfg))} (file; write)`,
    );
    expect(printed).toContain(
      `${S}.pluginKey = <redacted> (server config; write)`,
    );
    expect(printed).not.toContain('server-seed');
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(false);
  });

  it('skips the install of a current plugin but still writes missing config', async () => {
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok(
        JSON.stringify({
          entries: { [S]: { config: { pluginKey: 'kept-seed' } } },
        }),
      ),
      'openclaw plugins inspect --all --json': ok(
        JSON.stringify([
          {
            plugin: { id: S, version: '0.14.0' },
            install: {
              source: 'npm',
              resolvedName: `@karmaniverous/${S}`,
              resolvedVersion: '0.14.0',
            },
          },
        ]),
      ),
      [`npm view @karmaniverous/${S}`]: ok('"0.14.0"'),
      [`npm view @karmaniverous/${S}@0.14.0 jeeves.conversationHooks`]: ok(''),
    });
    const cfg = join(dir, 'cfg');
    await run('-c', cfg);
    expect(
      state.fake.lines().some((l) => / plugins install /.test(` ${l} `)),
    ).toBe(false);
    expect(batch()).toEqual([
      { path: `plugins.entries.${S}.config.configRoot`, value: resolve(cfg) },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
    ]);
  });

  it('--force-reinstall installs without reading install records', async () => {
    await run('-c', join(dir, 'cfg'), '--force-reinstall');
    const lines = state.fake?.lines() ?? [];
    expect(lines.some((l) => l.includes('plugins inspect'))).toBe(false);
    expect(lines.some((l) => / plugins install /.test(` ${l} `))).toBe(true);
  });
});
