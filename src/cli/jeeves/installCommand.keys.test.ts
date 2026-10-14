/**
 * Tests for `jeeves install`'s server plugin key handling: the generated
 * key written to both ends, the server's existing key reused, redaction in
 * output, and fail-before-write when the key can't be synced. Child
 * processes are faked; no OpenClaw is touched.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POST_PLUGIN_RESULT,
  serverConfigPath,
  serverPluginScript,
  useCommandTest,
  writeServerConfig,
} from './commandTestHarness.js';
import { registerInstallCommand } from './installCommand.js';
import { fakeRunner } from './plugins/fakePorts.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import type * as SecretsModule from './plugins/secrets.js';
import { ServerPluginKeyError } from './plugins/serverKeySync.js';
import { type CommandTestPorts, S } from './plugins/workflowTestKit.js';
import type * as PostPluginModule from './postPluginSteps.js';

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

vi.mock('./postPluginSteps.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PostPluginModule>()),
  runPostPluginSteps: () => Promise.resolve(DEFAULT_POST_PLUGIN_RESULT),
}));

const HOOKS = '["before_prompt_build"]';

describe('jeeves install (server plugin key)', () => {
  const { paths, out, run, batch, mutations } = useCommandTest(state, {
    prefix: 'jeeves-install-keys-',
    register: registerInstallCommand,
    command: 'install',
    baseArgs: ({ ws }) => ['server', '-w', ws],
  });
  const soul = () => existsSync(join(paths.ws, 'SOUL.md'));

  it('writes --config-root and defaults, and the generated key to both ends', async () => {
    state.fake = fakeRunner(serverPluginScript(undefined, false, HOOKS));
    const cfg = join(paths.dir, 'cfg');
    writeServerConfig(cfg, { port: 1934, keys: { alice: 'a' } });
    await run('-c', cfg);
    expect(soul()).toBe(true);
    // Plugin config and hook access in one batch before the install (the
    // plugin reads both on activation).
    expect(state.temp?.written).toHaveLength(1);
    expect(batch()).toEqual([
      { path: `plugins.entries.${S}.config.configRoot`, value: resolve(cfg) },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
      { path: `plugins.entries.${S}.config.pluginKey`, value: SEED },
      {
        path: `plugins.entries.${S}.hooks.allowConversationAccess`,
        value: true,
      },
    ]);
    const lines = state.fake.lines();
    const firstSet = lines.findIndex((l) => l.includes(' config set '));
    const install = lines.findIndex((l) => l.includes(' plugins install '));
    expect(firstSet).toBeGreaterThanOrEqual(0);
    expect(firstSet).toBeLessThan(install);
    const printed = out.join('\n');
    expect(printed).not.toContain(SEED);
    expect(lines.join('\n')).not.toContain(SEED);
    expect(printed).toContain('Restart jeeves-server');
    expect(printed).toContain('Restart the gateway');
    expect(readFileSync(serverConfigPath(cfg), 'utf-8')).toBe(
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
    state.fake = fakeRunner(serverPluginScript(undefined, false, HOOKS));
    await expect(run('-c', join(paths.dir, 'cfg'))).rejects.toBeInstanceOf(
      ServerPluginKeyError,
    );
    expect(soul()).toBe(false);
    expect(mutations()).toEqual([]);
  });

  it('fails before any change when the plugin and server keys differ', async () => {
    const cfg = join(paths.dir, 'cfg');
    writeServerConfig(cfg, { keys: { _plugin: 'server-seed' } });
    const before = readFileSync(serverConfigPath(cfg), 'utf-8');
    state.fake = fakeRunner(
      serverPluginScript({ [S]: { config: { pluginKey: 'mine' } } }),
    );
    await expect(run('-c', cfg)).rejects.toBeInstanceOf(ServerPluginKeyError);
    expect(readFileSync(serverConfigPath(cfg), 'utf-8')).toBe(before);
    expect(soul()).toBe(false);
    expect(mutations()).toEqual([]);
  });

  it("uses the server's keys._plugin and a --plugin-config file", async () => {
    state.fake = fakeRunner(serverPluginScript(undefined, false, HOOKS));
    const cfg = join(paths.dir, 'cfg');
    writeServerConfig(cfg, { keys: { _plugin: 'server-seed' } });
    const file = join(paths.dir, 'plugins.json');
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
    expect(mutations()).toEqual([]);
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
    expect(soul()).toBe(false);
  });
});
