/**
 * Tests for `jeeves install` wiring: plugin config precedence end to end,
 * fail-before-write on missing required config, secret redaction in output.
 * Child processes are faked; no OpenClaw is touched.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useConsoleCapture, useUnsetEnv } from '../../test/cliHarness.js';
import { useTempDir } from '../../test/tempDir.js';
import { registerInstallCommand } from './installCommand.js';
import { fakeRunner, fakeTempFiles, ok } from './plugins/fakePorts.js';
import { MissingPluginConfigError } from './plugins/pluginConfigResolve.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import type * as SecretsModule from './plugins/secrets.js';
import { ServerPluginKeyError } from './plugins/serverKeySync.js';
import {
  type CommandTestPorts,
  npmRecord,
  S,
  SPKG,
} from './plugins/workflowTestKit.js';

const SEED = 'c0ffee'.repeat(10) + 'c0ff';

const state = vi.hoisted((): CommandTestPorts => ({}));

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  const { createServerConfigWriter } =
    await import('./plugins/serverConfigWrite.js');
  const { commandWorkflowDeps } = await import('./plugins/workflowTestKit.js');
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean) =>
      commandWorkflowDeps(state, createServerConfigWriter(), dryRun),
  };
});

vi.mock('./plugins/secrets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SecretsModule>()),
  generatePluginKey: () => SEED,
}));

describe('jeeves install (plugin config)', () => {
  const tempDir = useTempDir('jeeves-install-');
  const out = useConsoleCapture();
  useUnsetEnv('JEEVES_CONFIG_ROOT');
  let dir: string;
  let ws: string;

  beforeEach(() => {
    dir = tempDir();
    ws = join(dir, 'ws');
    mkdirSync(ws, { recursive: true });
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok('{}'),
      'openclaw plugins inspect --all --json': ok('[]'),
      [`npm view ${SPKG}`]: ok('"0.14.0"'),
      [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(
        '["before_prompt_build"]',
      ),
    });
    state.temp = fakeTempFiles();
  });

  const run = async (...args: string[]) => {
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    await program.parseAsync(['install', 'server', '-w', ws, ...args], {
      from: 'user',
    });
  };
  const batch = (): unknown => state.temp?.batch();
  const serverFile = (cfg: string) => join(cfg, 'jeeves-server', 'config.json');
  const writeServer = (cfg: string, value: unknown) => {
    mkdirSync(join(cfg, 'jeeves-server'), { recursive: true });
    writeFileSync(serverFile(cfg), JSON.stringify(value, null, 2) + '\n');
  };

  it('fails before writing any content when configRoot is missing', async () => {
    await expect(run()).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(false);
    expect(
      state.fake?.lines().some((l) => / plugins install /.test(` ${l} `)),
    ).toBe(false);
  });

  it('writes --config-root and defaults, and the generated key to both ends', async () => {
    const cfg = join(dir, 'cfg');
    writeServer(cfg, { port: 1934, keys: { alice: 'a' } });
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
    expect(printed).toContain('Restart jeeves-server');
    expect(printed).toContain('Restart the gateway');
    expect(readFileSync(serverFile(cfg), 'utf-8')).toBe(
      JSON.stringify(
        { port: 1934, keys: { alice: 'a', _plugin: SEED } },
        null,
        2,
      ) + '\n',
    );
    const backups = readdirSync(join(cfg, 'jeeves-server')).filter((f) =>
      f.startsWith('config.json.bak-'),
    );
    expect(backups).toHaveLength(1);
  });

  it('fails before any change when a key would be generated without a server config', async () => {
    await expect(run('-c', join(dir, 'cfg'))).rejects.toBeInstanceOf(
      ServerPluginKeyError,
    );
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(false);
    expect(
      state.fake?.lines().some((l) => / plugins install /.test(` ${l} `)),
    ).toBe(false);
  });

  it('fails before any change when the plugin and server keys differ', async () => {
    const cfg = join(dir, 'cfg');
    writeServer(cfg, { keys: { _plugin: 'server-seed' } });
    const before = readFileSync(serverFile(cfg), 'utf-8');
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok(
        JSON.stringify({ entries: { [S]: { config: { pluginKey: 'mine' } } } }),
      ),
      'openclaw plugins inspect --all --json': ok('[]'),
      [`npm view ${SPKG}`]: ok('"0.14.0"'),
      [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(''),
    });
    await expect(run('-c', cfg)).rejects.toBeInstanceOf(ServerPluginKeyError);
    expect(readFileSync(serverFile(cfg), 'utf-8')).toBe(before);
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(false);
    expect(
      state.fake
        .lines()
        .some((l) => / (plugins install|config set) /.test(` ${l} `)),
    ).toBe(false);
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
        JSON.stringify([npmRecord(S, SPKG, '0.14.0')]),
      ),
      [`npm view ${SPKG}`]: ok('"0.14.0"'),
      [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(''),
    });
    const cfg = join(dir, 'cfg');
    await run('-c', cfg);
    expect(
      state.fake.lines().some((l) => / plugins install /.test(` ${l} `)),
    ).toBe(false);
    // No server config: plugin side kept, with a warning; nothing created.
    expect(out.join('\n')).toContain(`Warning: ${serverFile(cfg)} not found`);
    expect(existsSync(serverFile(cfg))).toBe(false);
    expect(batch()).toEqual([
      { path: `plugins.entries.${S}.config.configRoot`, value: resolve(cfg) },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
    ]);
  });

  it('--content-only renders content without touching OpenClaw or requiring plugin config', async () => {
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    const cfg = join(dir, 'cfg');
    await program.parseAsync(
      ['install', '-w', ws, '-c', cfg, '--content-only'],
      { from: 'user' },
    );
    expect(existsSync(join(ws, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(cfg, 'jeeves-core', 'config.json'))).toBe(true);
    expect(state.fake?.calls).toEqual([]);
    expect(out.some((l) => l.includes('Restart the gateway'))).toBe(false);
    expect(out.at(-1)).toBe('✅ Jeeves installed.');
  });

  it('targets all four component plugins by default', async () => {
    const cfg = join(dir, 'cfg');
    writeServer(cfg, { keys: {} });
    const pkgs = ['runner', 'watcher', 'server', 'meta'].map(
      (c) => `@karmaniverous/jeeves-${c}-openclaw`,
    );
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok('{}'),
      'openclaw plugins inspect --all --json': ok('[]'),
      ...Object.fromEntries(
        pkgs.flatMap((p) => [
          [`npm view ${p}`, ok('"1.0.0"')],
          [`npm view ${p}@1.0.0 jeeves.conversationHooks`, ok('')],
        ]),
      ),
    });
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    await program.parseAsync(['install', '-w', ws, '-c', cfg, '--dry-run'], {
      from: 'user',
    });
    expect(
      out.filter((l) => l.startsWith('[dry-run] openclaw plugins install ')),
    ).toEqual(
      pkgs.map(
        (p) =>
          `[dry-run] openclaw plugins install npm:${p}@1.0.0 --pin --accept-capabilities --force`,
      ),
    );
    expect(
      state.fake.lines().filter((l) => / plugins install /.test(` ${l} `)),
    ).toEqual([]);
  });

  it('--force-reinstall installs without reading install records', async () => {
    writeServer(join(dir, 'cfg'), { keys: {} });
    await run('-c', join(dir, 'cfg'), '--force-reinstall');
    const lines = state.fake?.lines() ?? [];
    const firstInstall = lines.findIndex((l) =>
      / plugins install /.test(` ${l} `),
    );
    expect(firstInstall).toBeGreaterThanOrEqual(0);
    // Only the post-install migration sweep may inspect; no install-record read.
    expect(
      lines.slice(0, firstInstall).some((l) => l.includes('plugins inspect')),
    ).toBe(false);
  });
});
