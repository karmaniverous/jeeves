import { describe, expect, it } from 'vitest';

import { executePlan } from './executePlan.js';
import { fakeRunner, fakeTempFiles, ok } from './fakePorts.js';
import type { LegacyFs } from './legacyExtensions.js';
import type { ServerKeyWrite } from './serverKeySync.js';

type Context = Parameters<typeof executePlan>[1];

const noServerWrite = (): Promise<string> =>
  Promise.reject(new Error('must not write the server config'));

const noFs: LegacyFs = {
  isDirectory: () => false,
  readPackageName: () => undefined,
  removeDir: () => {
    throw new Error('must not remove');
  },
};

/**
 * Execution context with inert defaults and a captured log.
 *
 * @param over - Overrides.
 * @returns The context and its log lines.
 */
function setup(over: Partial<Context> = {}): { ctx: Context; log: string[] } {
  const log: string[] = [];
  return {
    log,
    ctx: {
      runner: fakeRunner().runner,
      fs: noFs,
      tempFiles: fakeTempFiles().files,
      serverConfig: noServerWrite,
      log: (l) => log.push(l),
      dryRun: false,
      ...over,
    },
  };
}

describe('executePlan', () => {
  it('logs a legacy dir that is already gone', async () => {
    const { ctx, log } = setup();
    await executePlan([{ kind: 'removeDir', path: '/gone' }], ctx);
    expect(log).toEqual(['legacy plugin copy already gone: /gone']);
  });

  it('logs and runs an exec step', async () => {
    const fake = fakeRunner();
    const { ctx, log } = setup({ runner: fake.runner });
    await executePlan(
      [
        {
          kind: 'exec',
          command: 'openclaw',
          args: ['plugins', 'uninstall', 'a-openclaw', '--force'],
        },
      ],
      ctx,
    );
    expect(log).toEqual(['$ openclaw plugins uninstall a-openclaw --force']);
    expect(fake.lines()).toEqual([
      'openclaw plugins uninstall a-openclaw --force',
    ]);
  });

  it('skips repair commands when the uninstall left a clean config', async () => {
    const fake = fakeRunner({
      'openclaw config get plugins': ok('{"load":{"paths":[]}}'),
    });
    const { ctx } = setup({ runner: fake.runner, log: () => undefined });
    await executePlan(
      [
        {
          kind: 'repairAfterUninstall',
          before: { load: { paths: [] } },
          pluginIds: ['a-openclaw'],
        },
      ],
      ctx,
    );
    expect(fake.lines()).toEqual(['openclaw config get plugins --json']);
  });

  it('passes a config batch as an owner-only temp file and deletes it', async () => {
    const fake = fakeRunner();
    const temp = fakeTempFiles('icacls exited 5');
    const { ctx, log } = setup({ runner: fake.runner, tempFiles: temp.files });
    await executePlan(
      [
        {
          kind: 'configSetBatch',
          ops: [{ path: 'plugins.entries.a.config.k', value: 's3cr3t' }],
          redact: ['s3cr3t'],
        },
      ],
      ctx,
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
    expect(log.slice(0, 2)).toEqual([
      '$ openclaw config set --batch-file <private temp file>',
      '  batch file content: [{"path":"plugins.entries.a.config.k","value":"<redacted>"}]',
    ]);
    expect(log.join('\n')).not.toContain('s3cr3t');
    expect(log.some((l) => l.startsWith('warning: could not restrict'))).toBe(
      true,
    );
  });

  it('writes the server key through the writer and logs no secret', async () => {
    const writes: ServerKeyWrite[] = [];
    const write: ServerKeyWrite = {
      path: '/cfg/jeeves-server/config.json',
      value: 's3cr3t',
      expect: { kind: 'absent' },
    };
    const { ctx, log } = setup({
      serverConfig: (w) => {
        writes.push(w);
        return Promise.resolve('/cfg/jeeves-server/config.json.bak-1');
      },
    });
    await executePlan([{ kind: 'serverKeyWrite', write }], ctx);
    expect(writes).toEqual([write]);
    expect(log).toEqual([
      'set keys._plugin in /cfg/jeeves-server/config.json (value not shown; backup: /cfg/jeeves-server/config.json.bak-1)',
    ]);
  });

  it('dry run never calls the runner', async () => {
    const fake = fakeRunner();
    const temp = fakeTempFiles();
    const { ctx, log } = setup({
      runner: fake.runner,
      tempFiles: temp.files,
      dryRun: true,
    });
    await executePlan(
      [
        {
          kind: 'exec',
          command: 'openclaw',
          args: ['plugins', 'uninstall', 'a-openclaw', '--force'],
        },
        { kind: 'configSetBatch', ops: [{ path: 'x.y', value: 1 }] },
        { kind: 'repairAfterUninstall', before: {}, pluginIds: ['a-openclaw'] },
        {
          kind: 'serverKeyWrite',
          write: { path: '/s.json', value: 'k3y', expect: { kind: 'absent' } },
        },
      ],
      ctx,
    );
    expect(fake.calls).toEqual([]);
    expect(temp.written).toEqual([]);
    expect(log.slice(0, 3)).toEqual([
      '[dry-run] openclaw plugins uninstall a-openclaw --force',
      '[dry-run] openclaw config set --batch-file <private temp file>',
      '[dry-run]   batch file content: [{"path":"x.y","value":1}]',
    ]);
    expect(log.at(-1)).toMatch(
      /^\[dry-run\] set keys\._plugin = <redacted> in \/s\.json \(currently unset;/,
    );
    expect(log.join('\n')).not.toContain('k3y');
  });
});
