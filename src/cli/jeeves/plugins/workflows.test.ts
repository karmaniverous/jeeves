import { describe, expect, it } from 'vitest';

import { CommandFailedError } from './commandRunner.js';
import type { LegacyFs } from './legacyExtensions.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { failed, type FakeRunner, fakeRunner, ok } from './testRunner.js';
import {
  installPlugins,
  type PluginWorkflowDeps,
  selectUpdateTargets,
  uninstallPlugins,
} from './workflows.js';

const W = 'jeeves-watcher-openclaw';
const R = 'jeeves-runner-openclaw';
const WPKG = `@karmaniverous/${W}`;
const RPKG = `@karmaniverous/${R}`;
const CONFIG_DIR = '/oc';
const legacy = (id: string) => ['', 'oc', 'extensions', id].join('/');

/** Fake fs whose legacy dirs are keyed by forward-slash path. */
function fakeFs(legacyPkgs: Record<string, string>) {
  const removed: string[] = [];
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const fs: LegacyFs = {
    isDirectory: (p) => norm(p) in legacyPkgs && !removed.includes(norm(p)),
    readPackageName: (d) => legacyPkgs[norm(d)],
    removeDir: (p) => {
      removed.push(norm(p));
    },
  };
  return { fs, removed };
}

function setup(
  script: Parameters<typeof fakeRunner>[0],
  legacyPkgs: Record<string, string> = {},
  dryRun = false,
) {
  const fake: FakeRunner = fakeRunner({
    'openclaw --version': ok('OpenClaw 2026.9.6'),
    [`npm view ${WPKG}`]: ok('"0.16.0"'),
    [`npm view ${RPKG}`]: ok('"0.9.0"'),
    ...script,
  });
  const { fs, removed } = fakeFs(legacyPkgs);
  const log: string[] = [];
  const deps: PluginWorkflowDeps = {
    runner: fake.runner,
    fs,
    configDir: CONFIG_DIR,
    log: (l) => log.push(l),
    dryRun,
  };
  return { fake, removed, log, deps };
}

const PLUGINS = JSON.stringify({
  entries: {
    [W]: { enabled: true, config: { apiUrl: 'http://127.0.0.1:1936' } },
  },
  load: { paths: ['/opt/x'] },
});

const mutating = (lines: string[]) =>
  lines.filter((l) =>
    / plugins (install|uninstall) | config (set|unset) /.test(` ${l} `),
  );

describe('installPlugins', () => {
  const targets = parsePluginSpecs(['watcher', 'runner@^0.9']);

  it('installs, removes legacy copies after install, then grants hook access', async () => {
    const { fake, removed, deps } = setup(
      { 'openclaw config get plugins': ok(PLUGINS) },
      { [legacy(W)]: WPKG },
    );
    let removedBeforeInstall = false;
    const origRemove = deps.fs.removeDir;
    deps.fs.removeDir = (p) => {
      removedBeforeInstall = !fake
        .lines()
        .some((l) =>
          l.includes('plugins install npm:@karmaniverous/jeeves-watcher'),
        );
      origRemove(p);
    };

    const resolved = await installPlugins(deps, targets);

    expect(resolved.map((t) => t.version)).toEqual(['0.16.0', '0.9.0']);
    expect(mutating(fake.lines())).toEqual([
      `openclaw plugins install npm:${WPKG}@0.16.0 --pin --accept-capabilities --force`,
      `openclaw plugins install npm:${RPKG}@0.9.0 --pin --accept-capabilities --force`,
      `openclaw config set --batch-json ${JSON.stringify([
        {
          path: `plugins.entries.${W}.hooks.allowConversationAccess`,
          value: true,
        },
        {
          path: `plugins.entries.${R}.hooks.allowConversationAccess`,
          value: true,
        },
      ])}`,
    ]);
    expect(removed).toEqual([legacy(W)]);
    expect(removedBeforeInstall).toBe(false);
  });

  it('never writes plugins.installs', async () => {
    const { fake, deps } = setup({
      'openclaw config get plugins': ok(PLUGINS),
    });
    await installPlugins(deps, targets);
    expect(fake.lines().some((l) => l.includes('plugins.installs'))).toBe(
      false,
    );
  });

  it('dry run prints exact commands and runs only read-only queries', async () => {
    const { fake, removed, log, deps } = setup(
      { 'openclaw config get plugins': ok(PLUGINS) },
      { [legacy(W)]: WPKG },
      true,
    );
    await installPlugins(deps, targets);

    expect(mutating(fake.lines())).toEqual([]);
    expect(removed).toEqual([]);
    expect(log).toContain(
      `[dry-run] openclaw plugins install npm:${WPKG}@0.16.0 --pin --accept-capabilities --force`,
    );
    expect(
      log.some((l) => l.startsWith('[dry-run] remove legacy plugin copy:')),
    ).toBe(true);
    expect(
      log.some((l) =>
        l.startsWith("[dry-run] openclaw config set --batch-json '["),
      ),
    ).toBe(true);
  });

  it('stops at the first failing openclaw command', async () => {
    const { fake, removed, deps } = setup(
      {
        'openclaw config get plugins': ok(PLUGINS),
        [`openclaw plugins install npm:${WPKG}`]: failed(
          'install policy blocked',
        ),
      },
      { [legacy(W)]: WPKG },
    );
    await expect(installPlugins(deps, targets)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
    expect(mutating(fake.lines())).toHaveLength(1);
    expect(removed).toEqual([]);
  });

  it('skips the batch when hook access is already granted', async () => {
    const { fake, deps } = setup({
      'openclaw config get plugins': ok(
        JSON.stringify({
          entries: { [W]: { hooks: { allowConversationAccess: true } } },
        }),
      ),
    });
    await installPlugins(deps, parsePluginSpecs(['watcher']));
    expect(fake.lines().some((l) => l.includes('config set'))).toBe(false);
  });

  it('is a no-op for no targets', async () => {
    const { fake, deps } = setup({});
    await expect(installPlugins(deps, [])).resolves.toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('selectUpdateTargets', () => {
  it('defaults to configured Jeeves plugins at latest', async () => {
    const { deps } = setup({
      'openclaw config get plugins': ok(
        JSON.stringify({ entries: { [W]: {}, [R]: {}, 'memory-core': {} } }),
      ),
    });
    const targets = await selectUpdateTargets(deps, []);
    expect(targets.map((t) => `${t.pluginId}@${t.range}`)).toEqual([
      `${R}@latest`,
      `${W}@latest`,
    ]);
  });

  it('uses explicit specs as given', async () => {
    const { fake, deps } = setup({});
    const specs = parsePluginSpecs([`${WPKG}@1.0.1`]);
    await expect(selectUpdateTargets(deps, specs)).resolves.toEqual(specs);
    expect(fake.calls).toHaveLength(0);
  });

  it('fails when nothing is installed', async () => {
    const { deps } = setup({ 'openclaw config get plugins': ok('{}') });
    await expect(selectUpdateTargets(deps, [])).rejects.toThrow(
      /No installed Jeeves plugins/,
    );
  });
});

describe('uninstallPlugins', () => {
  const after = JSON.stringify({ entries: { [W]: { enabled: false } } });

  it('uninstalls, removes legacy copies, then repairs the S1 leftovers', async () => {
    const { fake, removed, deps } = setup(
      { 'openclaw config get plugins': [ok(PLUGINS), ok(after)] },
      { [legacy(W)]: WPKG },
    );
    await expect(uninstallPlugins(deps, [])).resolves.toEqual([W]);
    expect(mutating(fake.lines())).toEqual([
      `openclaw plugins uninstall ${W} --force`,
      `openclaw config unset plugins.entries.${W}`,
      `openclaw config set --batch-json ${JSON.stringify([
        { path: 'plugins.load', value: { paths: ['/opt/x'] } },
      ])}`,
    ]);
    expect(removed).toEqual([legacy(W)]);
  });

  it('dry run describes the conditional repair without mutating', async () => {
    const { fake, log, deps } = setup(
      { 'openclaw config get plugins': ok(PLUGINS) },
      {},
      true,
    );
    await uninstallPlugins(deps, parsePluginSpecs(['watcher']));
    expect(mutating(fake.lines())).toEqual([]);
    expect(log).toContain(`[dry-run] openclaw plugins uninstall ${W} --force`);
    expect(log).toContain(
      `[dry-run] if left as {"enabled":false}: openclaw config unset plugins.entries.${W}`,
    );
    expect(
      log.some((l) => l.startsWith('[dry-run] if plugins.load was removed:')),
    ).toBe(true);
  });

  it('propagates an uninstall failure before any repair', async () => {
    const { fake, deps } = setup({
      'openclaw config get plugins': ok(PLUGINS),
      'openclaw plugins uninstall': failed('not installed'),
    });
    await expect(uninstallPlugins(deps, [])).rejects.toBeInstanceOf(
      CommandFailedError,
    );
    expect(fake.lines().some((l) => l.includes('config unset'))).toBe(false);
  });

  it('does nothing when no Jeeves plugin is configured', async () => {
    const { fake, deps } = setup({ 'openclaw config get plugins': ok('{}') });
    await expect(uninstallPlugins(deps, [])).resolves.toEqual([]);
    expect(mutating(fake.lines())).toEqual([]);
  });
});
