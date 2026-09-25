/**
 * Idempotent installs (skip when the exact version is installed,
 * --force-reinstall) and declared conversation hooks.
 */

import { describe, expect, it } from 'vitest';

import { failed, ok } from './fakePorts.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { installPlugins } from './workflows.js';
import {
  legacy,
  mutating,
  npmRecord,
  R,
  RPKG,
  setupWorkflow,
  W,
  WPKG,
} from './workflowTestKit.js';

const inspect = (...entries: unknown[]) => ({
  'openclaw plugins inspect --all --json': ok(JSON.stringify(entries)),
  'openclaw config get plugins': ok('{}'),
});

const installs = (lines: string[]) =>
  mutating(lines).filter((l) => l.includes(' plugins install '));

describe('installPlugins: already installed', () => {
  const targets = parsePluginSpecs(['watcher', 'runner']);

  it('skips plugins installed from npm at the exact version but still grants hook access', async () => {
    const { fake, temp, log, deps } = setupWorkflow(
      inspect(npmRecord(W, WPKG, '0.16.0'), npmRecord(R, RPKG, '0.8.0')),
    );
    const { resolved } = await installPlugins(deps, targets);
    expect(resolved.map((t) => t.installed === true)).toEqual([true, false]);
    expect(installs(fake.lines())).toEqual([
      `openclaw plugins install npm:${RPKG}@0.9.0 --pin --accept-capabilities --force`,
    ]);
    expect(temp.batch()).toEqual([
      {
        path: `plugins.entries.${W}.hooks.allowConversationAccess`,
        value: true,
      },
    ]);
    expect(log).toContain(
      `  ${WPKG}@0.16.0 (already installed; install skipped; conversation hooks: before_prompt_build)`,
    );
  });

  it('reinstalls with --force-reinstall without reading install records', async () => {
    const { fake, deps } = setupWorkflow(inspect(npmRecord(W, WPKG, '0.16.0')));
    await installPlugins(deps, parsePluginSpecs(['watcher']), {
      forceReinstall: true,
    });
    expect(fake.lines().some((l) => l.includes('plugins inspect'))).toBe(false);
    expect(installs(fake.lines())).toHaveLength(1);
  });

  it.each([
    [
      'a v0.x path install',
      {
        plugin: { id: W, version: '0.16.0' },
        install: { source: 'path', version: '0.16.0' },
      },
    ],
    ['a different recorded version', npmRecord(W, WPKG, '0.15.6')],
    [
      'a different loaded version',
      { ...npmRecord(W, WPKG, '0.16.0'), plugin: { id: W, version: '0.15.6' } },
    ],
    [
      'a different package',
      npmRecord(W, '@someone/jeeves-watcher-openclaw', '0.16.0'),
    ],
    ['no install record', { plugin: { id: W, version: '0.16.0' } }],
  ])('reinstalls over %s', async (_label, entry) => {
    const { fake, deps } = setupWorkflow(inspect(entry));
    await installPlugins(deps, parsePluginSpecs(['watcher']));
    expect(installs(fake.lines())).toHaveLength(1);
  });

  it('matches the package name from the spec when resolvedName is absent', async () => {
    const { fake, deps } = setupWorkflow(
      inspect({
        plugin: { id: W },
        install: {
          source: 'npm',
          spec: `npm:${WPKG}@0.16.0`,
          version: '0.16.0',
        },
      }),
    );
    await installPlugins(deps, parsePluginSpecs(['watcher']));
    expect(installs(fake.lines())).toEqual([]);
  });

  it('reinstalls when a legacy copy is still present', async () => {
    const { fake, removed, deps } = setupWorkflow(
      inspect(npmRecord(W, WPKG, '0.16.0')),
      { [legacy(W)]: WPKG },
    );
    await installPlugins(deps, parsePluginSpecs(['watcher']));
    expect(installs(fake.lines())).toHaveLength(1);
    expect(removed).toEqual([legacy(W)]);
  });

  it.each([
    ['fails', failed('boom')],
    ['prints no JSON', ok('not json')],
  ])(
    'reinstalls everything with a warning when inspect %s',
    async (_l, result) => {
      const { fake, log, deps } = setupWorkflow({
        'openclaw plugins inspect --all --json': result,
        'openclaw config get plugins': ok('{}'),
      });
      await installPlugins(deps, targets);
      expect(installs(fake.lines())).toHaveLength(2);
      expect(
        log.some((l) =>
          l.startsWith('  warning: cannot read installed plugins'),
        ),
      ).toBe(true);
    },
  );

  it('tolerates log lines before the inspect JSON', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw plugins inspect --all --json': ok(
        `[config] warnings: x\n${JSON.stringify([npmRecord(W, WPKG, '0.16.0')])}`,
      ),
      'openclaw config get plugins': ok('{}'),
    });
    await installPlugins(deps, parsePluginSpecs(['watcher']));
    expect(installs(fake.lines())).toEqual([]);
  });
});

describe('installPlugins: declared conversation hooks', () => {
  it('grants nothing when no target declares a conversation hook', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok('{}'),
    });
    await installPlugins(deps, parsePluginSpecs(['runner']));
    expect(fake.lines().some((l) => l.includes('config set'))).toBe(false);
  });

  it('ignores declared hooks that are not conversation hooks', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok('{}'),
      [`npm view ${RPKG}@0.9.0 jeeves.conversationHooks`]:
        ok('["gateway_start"]'),
    });
    await installPlugins(deps, parsePluginSpecs(['runner']));
    expect(fake.lines().some((l) => l.includes('config set'))).toBe(false);
  });

  it('never removes an existing grant', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok(
        JSON.stringify({
          entries: { [R]: { hooks: { allowConversationAccess: true } } },
        }),
      ),
    });
    await installPlugins(deps, parsePluginSpecs(['runner']));
    expect(mutating(fake.lines()).some((l) => l.includes('config'))).toBe(
      false,
    );
  });

  it('fails before any mutation on a malformed declaration', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok('{}'),
      [`npm view ${RPKG}@0.9.0 jeeves.conversationHooks`]: ok(
        '"before_prompt_build"',
      ),
    });
    await expect(
      installPlugins(deps, parsePluginSpecs(['runner'])),
    ).rejects.toThrow(/must be an array of hook names/);
    expect(mutating(fake.lines())).toEqual([]);
  });
});
