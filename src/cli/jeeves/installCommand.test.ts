/**
 * Tests for `jeeves install` wiring: plugin config precedence end to end,
 * fail-before-write on missing required config, and plugin targeting.
 * Server key sync is in `installCommand.keys.test.ts`; the post-plugin
 * steps and bootstrap report in `installCommand.steps.test.ts`. Child
 * processes are faked; no OpenClaw is touched.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POST_PLUGIN_RESULT,
  serverConfigPath,
  serverPluginScript,
  useCommandTest,
  writeServerConfig,
} from './commandTestHarness.js';
import { registerInstallCommand } from './installCommand.js';
import { fakeRunner, ok } from './plugins/fakePorts.js';
import { MissingPluginConfigError } from './plugins/pluginConfigResolve.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import { type CommandTestPorts, S } from './plugins/workflowTestKit.js';
import type * as PostPluginModule from './postPluginSteps.js';

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

vi.mock('./postPluginSteps.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PostPluginModule>()),
  runPostPluginSteps: () => Promise.resolve(DEFAULT_POST_PLUGIN_RESULT),
}));

describe('jeeves install (plugin config)', () => {
  const { paths, out, run, batch } = useCommandTest(state, {
    prefix: 'jeeves-install-',
    register: registerInstallCommand,
    command: 'install',
    baseArgs: ({ ws }) => ['server', '-w', ws],
  });
  const installs = () =>
    (state.fake?.lines() ?? []).filter((l) =>
      / plugins install /.test(` ${l} `),
    );
  /** A fresh program, for runs without the `server` target. */
  const runAll = async (...args: string[]) => {
    const program = new Command().exitOverride();
    registerInstallCommand(program);
    await program.parseAsync(['install', '-w', paths.ws, ...args], {
      from: 'user',
    });
  };

  it('fails before writing any content when configRoot is missing', async () => {
    state.fake = fakeRunner(serverPluginScript(undefined, false, '["x"]'));
    await expect(run()).rejects.toBeInstanceOf(MissingPluginConfigError);
    expect(existsSync(join(paths.ws, 'SOUL.md'))).toBe(false);
    expect(installs()).toEqual([]);
  });

  it('skips the install of a current plugin but still writes missing config', async () => {
    state.fake = fakeRunner(
      serverPluginScript({ [S]: { config: { pluginKey: 'kept-seed' } } }, true),
    );
    const cfg = join(paths.dir, 'cfg');
    await run('-c', cfg);
    expect(installs()).toEqual([]);
    // No server config: plugin side kept, with a warning; nothing created.
    expect(out.join('\n')).toContain(
      `Warning: ${serverConfigPath(cfg)} not found`,
    );
    expect(existsSync(serverConfigPath(cfg))).toBe(false);
    expect(batch()).toEqual([
      { path: `plugins.entries.${S}.config.configRoot`, value: resolve(cfg) },
      {
        path: `plugins.entries.${S}.config.apiUrl`,
        value: 'http://127.0.0.1:1934',
      },
    ]);
  });

  it('--content-only renders content without touching OpenClaw or requiring plugin config', async () => {
    state.fake = fakeRunner();
    const cfg = join(paths.dir, 'cfg');
    await runAll('-c', cfg, '--content-only');
    expect(existsSync(join(paths.ws, 'SOUL.md'))).toBe(true);
    expect(existsSync(join(cfg, 'jeeves-core', 'config.json'))).toBe(true);
    expect(state.fake.calls).toEqual([]);
    expect(out.some((l) => l.includes('Restart the gateway'))).toBe(false);
    expect(out.at(-1)).toBe('✅ Jeeves installed.');
  });

  it('targets all four component plugins by default', async () => {
    const cfg = join(paths.dir, 'cfg');
    writeServerConfig(cfg, { keys: {} });
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
    await runAll('-c', cfg, '--dry-run');
    expect(
      out.filter((l) => l.startsWith('[dry-run] openclaw plugins install ')),
    ).toEqual(
      pkgs.map(
        (p) =>
          `[dry-run] openclaw plugins install npm:${p}@1.0.0 --pin --accept-capabilities --force`,
      ),
    );
    expect(installs()).toEqual([]);
  });

  it('--force-reinstall installs without reading install records', async () => {
    state.fake = fakeRunner(serverPluginScript(undefined, false, '["x"]'));
    writeServerConfig(join(paths.dir, 'cfg'), { keys: {} });
    await run('-c', join(paths.dir, 'cfg'), '--force-reinstall');
    const lines = state.fake.lines();
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
