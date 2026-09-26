import { describe, expect, it } from 'vitest';

import { executePlan } from './executePlan.js';
import { failed, fakeRunner, fakeTempFiles, ok } from './fakePorts.js';
import { buildInstallPlan, type ResolvedTarget } from './plan.js';
import { parsePluginSpec } from './pluginSpec.js';

const WATCHER = 'plugins.entries.jeeves-watcher-openclaw';
const META = 'plugins.entries.jeeves-meta-openclaw';

const target = (spec: string, version: string): ResolvedTarget => ({
  ...parsePluginSpec(spec),
  version,
  conversationHooks: ['before_prompt_build'],
});

/** Watcher + meta install plan with configRoot resolved for both. */
const plan = () =>
  buildInstallPlan(
    [target('watcher', '1.0.0'), target('meta', '2.0.0')],
    {},
    {
      ops: [
        { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
        { path: `${META}.config.configRoot`, value: '/srv/cfg' },
      ],
      values: [],
      secrets: [],
      unknownPluginIds: [],
    },
  );

/** Short form of a runner call line. */
const short = (line: string): string =>
  /^openclaw (config set|plugins install|plugins inspect)/.exec(line)?.[1] ??
  line;

const noServerWrite = (): Promise<string> =>
  Promise.reject(new Error('must not write the server config'));

const setup = (runner = fakeRunner(), dryRun = false) => {
  const temp = fakeTempFiles();
  const log: string[] = [];
  const slept: number[] = [];
  const ctx = {
    runner: runner.runner,
    fs: {
      isDirectory: () => false,
      readPackageName: () => undefined,
      removeDir: () => undefined,
    },
    tempFiles: temp.files,
    serverConfig: noServerWrite,
    log: (l: string) => log.push(l),
    dryRun,
    sleep: (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
  return { ctx, temp, log, slept };
};

describe('executePlan (install plan order)', () => {
  it('writes each plugin config, installs it, then sweeps, before the next plugin', async () => {
    const fake = fakeRunner();
    const { ctx, temp } = setup(fake);
    await executePlan(plan(), ctx);
    expect(fake.lines().map(short)).toEqual([
      'config set',
      'plugins install',
      'plugins inspect',
      'config set',
      'plugins install',
      'plugins inspect',
      'config set',
    ]);
    expect(temp.batch(0)).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
    ]);
    expect(temp.batch(1)).toEqual([
      { path: `${META}.config.configRoot`, value: '/srv/cfg' },
    ]);
  });

  it('retries a refused pre-install write with a sweep before each wait', async () => {
    const refusal = failed(
      'Cannot edit retained config at "plugins.entries.jeeves-watcher-openclaw.config". Plugin "jeeves-watcher-openclaw" data/settings upgrade is unfinished: x',
    );
    const fake = fakeRunner({
      'openclaw config set --batch-file': [refusal, ok(), ok(), ok()],
      'openclaw plugins install': ok(),
    });
    const { ctx, slept } = setup(fake);
    await executePlan(plan(), ctx);
    expect(fake.lines().map(short).slice(0, 5)).toEqual([
      'config set',
      'plugins inspect',
      'config set',
      'plugins install',
      'plugins inspect',
    ]);
    expect(slept).toEqual([2_000]);
  });

  it('stops before the install when the pre-install write fails otherwise', async () => {
    const fake = fakeRunner({
      'openclaw config set --batch-file': failed('invalid config', 1),
    });
    const { ctx } = setup(fake);
    await expect(executePlan(plan(), ctx)).rejects.toThrow(/exit 1/);
    expect(fake.lines().map(short)).toEqual(['config set']);
  });

  it('dry run prints the per-plugin order and executes nothing', async () => {
    const fake = fakeRunner();
    const { ctx, temp, log } = setup(fake, true);
    await executePlan(plan(), ctx);
    expect(fake.calls).toEqual([]);
    expect(temp.written).toEqual([]);
    const shown = log
      .filter((l) => !l.startsWith('[dry-run]   '))
      .map((l) => short(l.replace('[dry-run] ', '')));
    expect(shown).toEqual([
      'config set',
      'plugins install',
      'plugins inspect',
      'config set',
      'plugins install',
      'plugins inspect',
      'config set',
    ]);
    expect(log[1]).toBe(
      `[dry-run]   batch file content: [{"path":"${WATCHER}.config.configRoot","value":"/srv/cfg"}]`,
    );
  });
});
