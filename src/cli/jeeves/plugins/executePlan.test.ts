import { describe, expect, it } from 'vitest';

import { executePlan } from './executePlan.js';
import type { LegacyFs } from './legacyExtensions.js';
import { fakeRunner, ok } from './testRunner.js';

const noFs: LegacyFs = {
  isDirectory: () => false,
  readPackageName: () => undefined,
  removeDir: () => {
    throw new Error('must not remove');
  },
};

describe('executePlan', () => {
  it('logs a legacy dir that is already gone', async () => {
    const log: string[] = [];
    await executePlan([{ kind: 'removeDir', path: '/gone' }], {
      runner: fakeRunner().runner,
      fs: noFs,
      log: (l) => log.push(l),
      dryRun: false,
    });
    expect(log).toEqual(['legacy plugin copy already gone: /gone']);
  });

  it('skips repair commands when the uninstall left a clean config', async () => {
    const fake = fakeRunner({
      'openclaw config get plugins': ok('{"load":{"paths":[]}}'),
    });
    await executePlan(
      [
        {
          kind: 'repairAfterUninstall',
          before: { load: { paths: [] } },
          pluginIds: ['a-openclaw'],
        },
      ],
      { runner: fake.runner, fs: noFs, log: () => undefined, dryRun: false },
    );
    expect(fake.lines()).toEqual(['openclaw config get plugins --json']);
  });

  it('dry run never calls the runner', async () => {
    const fake = fakeRunner();
    const log: string[] = [];
    await executePlan(
      [
        {
          kind: 'exec',
          command: 'openclaw',
          args: ['plugins', 'uninstall', 'a-openclaw', '--force'],
        },
        { kind: 'repairAfterUninstall', before: {}, pluginIds: ['a-openclaw'] },
      ],
      { runner: fake.runner, fs: noFs, log: (l) => log.push(l), dryRun: true },
    );
    expect(fake.calls).toEqual([]);
    expect(log[0]).toBe(
      '[dry-run] openclaw plugins uninstall a-openclaw --force',
    );
  });
});
