import { describe, expect, it } from 'vitest';

import {
  computeHookAccessOps,
  computePostUninstallRepair,
  configuredPluginIds,
  isLeftoverDisabledEntry,
  pluginsConfigSchema,
} from './configPatch.js';
import { isJeevesPluginId } from './pluginSpec.js';
import { R, W } from './workflowTestKit.js';

describe('computeHookAccessOps', () => {
  it('writes only the hook leaf path, so entry config is preserved', () => {
    const plugins = pluginsConfigSchema.parse({
      entries: { [W]: { enabled: true, config: { apiUrl: 'http://x' } } },
    });
    expect(computeHookAccessOps(plugins, [W])).toEqual([
      {
        path: `plugins.entries.${W}.hooks.allowConversationAccess`,
        value: true,
      },
    ]);
  });

  it('skips plugins already granted and covers missing entries', () => {
    const plugins = pluginsConfigSchema.parse({
      entries: { [W]: { hooks: { allowConversationAccess: true } } },
    });
    expect(computeHookAccessOps(plugins, [W, R])).toEqual([
      {
        path: `plugins.entries.${R}.hooks.allowConversationAccess`,
        value: true,
      },
    ]);
    expect(computeHookAccessOps({}, [])).toEqual([]);
  });

  it('re-grants a non-true value', () => {
    const plugins = pluginsConfigSchema.parse({
      entries: { [W]: { hooks: { allowConversationAccess: false } } },
    });
    expect(computeHookAccessOps(plugins, [W])).toHaveLength(1);
  });
});

describe('isLeftoverDisabledEntry', () => {
  it.each([
    [{ enabled: false }, true],
    [{ enabled: true }, false],
    [{ enabled: false, config: {} }, false],
    [{}, false],
    [undefined, false],
    [null, false],
    [[false], false],
  ])('%j → %s', (entry, expected) => {
    expect(isLeftoverDisabledEntry(entry)).toBe(expected);
  });
});

describe('computePostUninstallRepair', () => {
  const load = { paths: ['/opt/extra-plugins'] };

  it('unsets {enabled:false} husks and restores a deleted plugins.load', () => {
    const repair = computePostUninstallRepair(
      { load, entries: { [W]: { config: {} } } },
      { entries: { [W]: { enabled: false }, other: { enabled: false } } },
      [W],
    );
    expect(repair).toEqual({
      unsetPaths: [`plugins.entries.${W}`],
      setOps: [{ path: 'plugins.load', value: load }],
    });
  });

  it('does nothing when the uninstall left a clean config', () => {
    expect(
      computePostUninstallRepair({ load }, { load, entries: {} }, [W]),
    ).toEqual({ unsetPaths: [], setOps: [] });
  });

  it('does not invent plugins.load when there was none', () => {
    expect(computePostUninstallRepair({}, {}, [W]).setOps).toEqual([]);
  });
});

describe('configuredPluginIds', () => {
  it('returns Jeeves ids with entries, sorted', () => {
    expect(
      configuredPluginIds(
        { entries: { [W]: {}, 'memory-core': {}, [R]: {} } },
        isJeevesPluginId,
      ),
    ).toEqual([R, W]);
    expect(configuredPluginIds({}, isJeevesPluginId)).toEqual([]);
  });
});
