import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  findLegacyExtension,
  legacyExtensionDir,
  type LegacyFs,
  nodeLegacyFs,
  resolveOpenClawConfigDir,
} from './legacyExtensions.js';

const home = resolve('/home/jeeves');

describe('resolveOpenClawConfigDir', () => {
  it.each([
    [{}, join(home, '.openclaw')],
    [{ OPENCLAW_STATE_DIR: '/srv/oc' }, resolve('/srv/oc')],
    [{ OPENCLAW_STATE_DIR: '~/state' }, join(home, 'state')],
    [{ OPENCLAW_CONFIG_PATH: '/etc/oc/openclaw.json' }, resolve('/etc/oc')],
    [
      { OPENCLAW_STATE_DIR: '/a', OPENCLAW_CONFIG_PATH: '/b/openclaw.json' },
      resolve('/a'),
    ],
    [{ OPENCLAW_STATE_DIR: '  ' }, join(home, '.openclaw')],
  ])('%j', (env, expected) => {
    expect(resolveOpenClawConfigDir(env, home)).toBe(expected);
  });
});

describe('findLegacyExtension', () => {
  const fake = (dirs: Record<string, string | undefined>): LegacyFs => ({
    isDirectory: (p) => p in dirs,
    readPackageName: (d) => dirs[d],
    removeDir: () => undefined,
  });
  const dir = legacyExtensionDir('/oc', 'jeeves-watcher-openclaw');
  const pkg = '@karmaniverous/jeeves-watcher-openclaw';

  it('finds a legacy copy of the expected package', () => {
    expect(
      findLegacyExtension(
        fake({ [dir]: pkg }),
        '/oc',
        'jeeves-watcher-openclaw',
        pkg,
      ),
    ).toBe(dir);
  });

  it('ignores a missing dir or a different package', () => {
    expect(
      findLegacyExtension(fake({}), '/oc', 'jeeves-watcher-openclaw', pkg),
    ).toBeUndefined();
    expect(
      findLegacyExtension(
        fake({ [dir]: 'someone-else' }),
        '/oc',
        'jeeves-watcher-openclaw',
        pkg,
      ),
    ).toBeUndefined();
  });
});

describe('nodeLegacyFs', () => {
  let root: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `jeeves-legacy-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(join(root, 'extensions', 'p'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads package names and removes directories', () => {
    const dir = join(root, 'extensions', 'p');
    expect(nodeLegacyFs.isDirectory(dir)).toBe(true);
    expect(nodeLegacyFs.readPackageName(dir)).toBeUndefined();
    writeFileSync(join(dir, 'package.json'), '{"name":"@karmaniverous/p"}');
    expect(nodeLegacyFs.readPackageName(dir)).toBe('@karmaniverous/p');
    writeFileSync(join(dir, 'package.json'), '{"name":42}');
    expect(nodeLegacyFs.readPackageName(dir)).toBeUndefined();
    nodeLegacyFs.removeDir(dir);
    expect(nodeLegacyFs.isDirectory(dir)).toBe(false);
  });
});
