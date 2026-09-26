import { describe, expect, it } from 'vitest';

import { CommandFailedError } from './commandRunner.js';
import { failed, ok } from './fakePorts.js';
import { parsePluginSpecs } from './pluginSpec.js';
import { installPlugins, selectUpdateTargets } from './workflows.js';
import {
  BATCH_PREFIX,
  legacy,
  mutating,
  R,
  RPKG,
  setupWorkflow,
  W,
  WPKG,
} from './workflowTestKit.js';

const PLUGINS = JSON.stringify({
  entries: {
    [W]: { enabled: true, config: { apiUrl: 'http://127.0.0.1:1936' } },
  },
  load: { paths: ['/opt/x'] },
});

describe('installPlugins', () => {
  const targets = parsePluginSpecs(['watcher', 'runner@^0.9']);

  it('installs, removes legacy copies after install, then grants hook access via a batch file', async () => {
    const { fake, temp, removed, deps } = setupWorkflow(
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

    const { resolved } = await installPlugins(deps, targets);

    expect(resolved.map((t) => t.version)).toEqual(['0.16.0', '0.9.0']);
    const lines = mutating(fake.lines());
    expect(lines.slice(0, 2)).toEqual([
      `openclaw plugins install npm:${WPKG}@0.16.0 --pin --accept-capabilities --force`,
      `openclaw plugins install npm:${RPKG}@0.9.0 --pin --accept-capabilities --force`,
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[2].startsWith(BATCH_PREFIX)).toBe(true);
    expect(lines[2]).toContain('config-set.batch.json');
    // Only the watcher declares a conversation hook.
    expect(temp.batch()).toEqual([
      {
        path: `plugins.entries.${W}.hooks.allowConversationAccess`,
        value: true,
      },
    ]);
    expect(temp.restricted).toEqual(['/tmp/jeeves-1']);
    expect(temp.removed).toEqual(['/tmp/jeeves-1']);
    expect(removed).toEqual([legacy(W)]);
    expect(removedBeforeInstall).toBe(false);
  });

  it('never writes plugins.installs and puts no JSON on a command line', async () => {
    const { fake, temp, deps } = setupWorkflow({
      'openclaw config get plugins': ok(PLUGINS),
    });
    await installPlugins(deps, targets);
    expect(fake.lines().some((l) => l.includes('plugins.installs'))).toBe(
      false,
    );
    expect(
      temp.written.some((f) => f.content.includes('plugins.installs')),
    ).toBe(false);
    expect(fake.lines().some((l) => l.includes('--batch-json'))).toBe(false);
  });

  it('dry run prints exact commands and the batch content, running only read-only queries', async () => {
    const { fake, temp, removed, log, deps } = setupWorkflow(
      { 'openclaw config get plugins': ok(PLUGINS) },
      { [legacy(W)]: WPKG },
      true,
    );
    await installPlugins(deps, targets);

    expect(mutating(fake.lines())).toEqual([]);
    expect(removed).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(log).toContain(
      `[dry-run] openclaw plugins install npm:${WPKG}@0.16.0 --pin --accept-capabilities --force`,
    );
    expect(
      log.some((l) => l.startsWith('[dry-run] remove legacy plugin copy:')),
    ).toBe(true);
    expect(log).toContain(
      '[dry-run] openclaw config set --batch-file <private temp file>',
    );
    expect(
      log.some((l) => l.startsWith('[dry-run]   batch file content: [')),
    ).toBe(true);
  });

  it('stops at the first failing openclaw command', async () => {
    const { fake, removed, deps } = setupWorkflow(
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

  it('deletes the batch file even when config set fails', async () => {
    const { temp, deps } = setupWorkflow({
      'openclaw config get plugins': ok(PLUGINS),
      'openclaw config set': failed('invalid config'),
    });
    await expect(installPlugins(deps, targets)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
    expect(temp.written).toHaveLength(1);
    expect(temp.removed).toEqual(['/tmp/jeeves-1']);
  });

  it('skips the batch when hook access is already granted', async () => {
    const { fake, deps } = setupWorkflow({
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
    const { fake, deps } = setupWorkflow({});
    await expect(installPlugins(deps, [])).resolves.toEqual({
      resolved: [],
      plan: [],
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('selectUpdateTargets', () => {
  it('defaults to configured Jeeves plugins at latest', async () => {
    const { deps } = setupWorkflow({
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
    const { fake, deps } = setupWorkflow({});
    const specs = parsePluginSpecs([`${WPKG}@1.0.1`]);
    await expect(selectUpdateTargets(deps, specs)).resolves.toEqual(specs);
    expect(fake.calls).toHaveLength(0);
  });

  it('fails when nothing is installed', async () => {
    const { deps } = setupWorkflow({ 'openclaw config get plugins': ok('{}') });
    await expect(selectUpdateTargets(deps, [])).rejects.toThrow(
      /No installed Jeeves plugins/,
    );
  });
});
