import { describe, expect, it } from 'vitest';

import { CommandFailedError } from './commandRunner.js';
import { failed, ok } from './testRunner.js';
import { uninstallPlugins } from './workflows.js';
import {
  BATCH_PREFIX,
  legacy,
  mutating,
  R,
  setupWorkflow,
  W,
  WPKG,
} from './workflowTestKit.js';

const PLUGINS = JSON.stringify({
  entries: {
    [W]: { enabled: true, config: { apiUrl: 'http://127.0.0.1:1936' } },
    'memory-core': { enabled: true },
  },
  load: { paths: ['/opt/x'] },
});

describe('uninstallPlugins', () => {
  const after = JSON.stringify({ entries: { [W]: { enabled: false } } });

  it('uninstalls every configured Jeeves plugin, removes legacy copies, then repairs the S1 leftovers', async () => {
    const { fake, temp, removed, deps } = setupWorkflow(
      { 'openclaw config get plugins': [ok(PLUGINS), ok(after)] },
      { [legacy(W)]: WPKG },
    );
    await expect(uninstallPlugins(deps)).resolves.toEqual([W]);
    const lines = mutating(fake.lines());
    expect(lines.slice(0, 2)).toEqual([
      `openclaw plugins uninstall ${W} --force`,
      `openclaw config unset plugins.entries.${W}`,
    ]);
    expect(lines[2].startsWith(BATCH_PREFIX)).toBe(true);
    expect(temp.batch()).toEqual([
      { path: 'plugins.load', value: { paths: ['/opt/x'] } },
    ]);
    expect(removed).toEqual([legacy(W)]);
  });

  it('dry run describes the uninstall and conditional repair without mutating', async () => {
    const { fake, temp, log, deps } = setupWorkflow(
      { 'openclaw config get plugins': ok(PLUGINS) },
      {},
      true,
    );
    await uninstallPlugins(deps);
    expect(mutating(fake.lines())).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(log).toContain(`[dry-run] openclaw plugins uninstall ${W} --force`);
    expect(log).toContain(
      `[dry-run] if left as {"enabled":false}: openclaw config unset plugins.entries.${W}`,
    );
    expect(log).toContain(
      '[dry-run] if plugins.load was removed: openclaw config set --batch-file <private temp file> with [{"path":"plugins.load","value":{"paths":["/opt/x"]}}]',
    );
  });

  it('propagates an uninstall failure before any repair', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok(PLUGINS),
      'openclaw plugins uninstall': failed('not installed'),
    });
    await expect(uninstallPlugins(deps)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
    expect(fake.lines().some((l) => l.includes('config unset'))).toBe(false);
  });

  it('does nothing when no Jeeves plugin is configured', async () => {
    const { fake, log, deps } = setupWorkflow({
      'openclaw config get plugins': ok(
        JSON.stringify({ entries: { 'memory-core': {} } }),
      ),
    });
    await expect(uninstallPlugins(deps)).resolves.toEqual([]);
    expect(mutating(fake.lines())).toEqual([]);
    expect(log).toContain(
      '  no Jeeves plugins configured; nothing to uninstall',
    );
  });

  it('skips plugin removal when the OpenClaw CLI is not installed', async () => {
    const { deps, log } = setupWorkflow({});
    deps.runner = () => Promise.reject(new Error('spawn openclaw ENOENT'));
    await expect(uninstallPlugins(deps)).resolves.toEqual([]);
    expect(log).toContain('  OpenClaw CLI not found; no plugins to remove');
  });

  it('still fails on other OpenClaw errors', async () => {
    const { deps } = setupWorkflow({
      'openclaw --version': failed('broken install'),
    });
    await expect(uninstallPlugins(deps)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
  });

  it('removes several plugins in id order', async () => {
    const { fake, deps } = setupWorkflow({
      'openclaw config get plugins': ok(
        JSON.stringify({ entries: { [W]: {}, [R]: {} } }),
      ),
    });
    await expect(uninstallPlugins(deps)).resolves.toEqual([R, W]);
    expect(
      mutating(fake.lines()).filter((l) => l.includes('plugins uninstall')),
    ).toEqual([
      `openclaw plugins uninstall ${R} --force`,
      `openclaw plugins uninstall ${W} --force`,
    ]);
  });
});
