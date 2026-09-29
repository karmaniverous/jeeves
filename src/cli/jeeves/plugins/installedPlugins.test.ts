import { describe, expect, it } from 'vitest';

import { failed, fakeRunner, ok } from './fakePorts.js';
import {
  isInstalledAt,
  type PluginInspectEntry,
  readInstalledPlugins,
} from './installedPlugins.js';

const PKG = '@karmaniverous/jeeves-meta-openclaw';
const ID = 'jeeves-meta-openclaw';

const entry = (
  install: PluginInspectEntry['install'],
  version?: string,
): PluginInspectEntry => ({
  plugin: { id: ID, ...(version ? { version } : {}) },
  ...(install ? { install } : {}),
});

describe('isInstalledAt', () => {
  it.each([
    [
      'npm record with resolved fields',
      entry(
        { source: 'npm', resolvedName: PKG, resolvedVersion: '1.0.0' },
        '1.0.0',
      ),
      true,
    ],
    [
      'npm record with spec and version only',
      entry({ source: 'npm', spec: `npm:${PKG}@1.0.0`, version: '1.0.0' }),
      true,
    ],
    [
      'npm record with a spec without the npm: prefix',
      entry({ source: 'npm', spec: `${PKG}@1.0.0`, version: '1.0.0' }),
      true,
    ],
    [
      'npm record whose resolvedSpec wins over spec',
      entry({
        source: 'npm',
        resolvedSpec: `${PKG}@1.0.0`,
        spec: '@x/y@1.0.0',
        version: '1.0.0',
      }),
      true,
    ],
    [
      'npm record with an unversioned spec',
      entry({ source: 'npm', spec: `npm:${PKG}`, version: '1.0.0' }),
      true,
    ],
    [
      'npm record naming no package',
      entry({ source: 'npm', version: '1.0.0' }),
      false,
    ],
    [
      'npm record without a recorded version',
      entry({ source: 'npm', resolvedName: PKG }, '1.0.0'),
      false,
    ],
    ['not installed', undefined, false],
    ['no record', entry(undefined, '1.0.0'), false],
    [
      'path record',
      entry({ source: 'path', version: '1.0.0' }, '1.0.0'),
      false,
    ],
    [
      'older version',
      entry({ source: 'npm', resolvedName: PKG, resolvedVersion: '0.9.0' }),
      false,
    ],
    [
      'loaded version differs',
      entry(
        { source: 'npm', resolvedName: PKG, resolvedVersion: '1.0.0' },
        '0.9.0',
      ),
      false,
    ],
    [
      'other package',
      entry({ source: 'npm', resolvedName: '@x/y', resolvedVersion: '1.0.0' }),
      false,
    ],
  ])('%s → %s', (_label, e, expected) => {
    expect(isInstalledAt(e, PKG, '1.0.0')).toBe(expected);
  });
});

describe('readInstalledPlugins', () => {
  it('indexes reports by plugin id and skips unrecognized entries', async () => {
    const fake = fakeRunner({
      'openclaw plugins inspect --all --json': ok(
        JSON.stringify([
          { plugin: { id: ID, version: '1.0.0' }, install: { source: 'npm' } },
          { nonsense: true },
        ]),
      ),
    });
    const result = await readInstalledPlugins(fake.runner);
    expect(result.ok && [...result.byId.keys()]).toEqual([ID]);
  });

  it('reports a failed inspect instead of throwing', async () => {
    const fake = fakeRunner({
      'openclaw plugins inspect': failed('boom', 2),
    });
    await expect(readInstalledPlugins(fake.runner)).resolves.toEqual({
      ok: false,
      reason: 'openclaw plugins inspect --all --json exited 2',
    });
  });

  it('reports output that is not an array', async () => {
    const fake = fakeRunner({ 'openclaw plugins inspect': ok('{"a":1}') });
    const result = await readInstalledPlugins(fake.runner);
    expect(result.ok).toBe(false);
  });
});
