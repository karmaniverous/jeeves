import { describe, expect, it } from 'vitest';

import { executePlan } from './executePlan.js';
import type { LegacyFs } from './legacyExtensions.js';
import { fakeRunner, fakeTempFiles, ok } from './testRunner.js';

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
      tempFiles: fakeTempFiles().files,
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
      {
        runner: fake.runner,
        fs: noFs,
        tempFiles: fakeTempFiles().files,
        log: () => undefined,
        dryRun: false,
      },
    );
    expect(fake.lines()).toEqual(['openclaw config get plugins --json']);
  });

  it('passes a config batch as an owner-only temp file and deletes it', async () => {
    const fake = fakeRunner();
    const temp = fakeTempFiles('icacls exited 5');
    const log: string[] = [];
    await executePlan(
      [
        {
          kind: 'configSetBatch',
          ops: [{ path: 'plugins.entries.a.config.k', value: 's3cr3t' }],
          redact: ['s3cr3t'],
        },
      ],
      {
        runner: fake.runner,
        fs: noFs,
        tempFiles: temp.files,
        log: (l) => log.push(l),
        dryRun: false,
      },
    );
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].args.slice(0, 3)).toEqual([
      'config',
      'set',
      '--batch-file',
    ]);
    expect(fake.calls[0].args[3].replace(/\\/g, '/')).toBe(
      '/tmp/jeeves-1/config-set.batch.json',
    );
    expect(temp.batch()).toEqual([
      { path: 'plugins.entries.a.config.k', value: 's3cr3t' },
    ]);
    expect(temp.removed).toEqual(['/tmp/jeeves-1']);
    expect(log.join('\n')).not.toContain('s3cr3t');
    expect(log.some((l) => l.startsWith('warning: could not restrict'))).toBe(
      true,
    );
  });

  it('dry run never calls the runner', async () => {
    const fake = fakeRunner();
    const temp = fakeTempFiles();
    const log: string[] = [];
    await executePlan(
      [
        {
          kind: 'exec',
          command: 'openclaw',
          args: ['plugins', 'uninstall', 'a-openclaw', '--force'],
        },
        { kind: 'configSetBatch', ops: [{ path: 'x.y', value: 1 }] },
        { kind: 'repairAfterUninstall', before: {}, pluginIds: ['a-openclaw'] },
      ],
      {
        runner: fake.runner,
        fs: noFs,
        tempFiles: temp.files,
        log: (l) => log.push(l),
        dryRun: true,
      },
    );
    expect(fake.calls).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(log.slice(0, 3)).toEqual([
      '[dry-run] openclaw plugins uninstall a-openclaw --force',
      '[dry-run] openclaw config set --batch-file <private temp file>',
      '[dry-run]   batch file content: [{"path":"x.y","value":1}]',
    ]);
  });
});
