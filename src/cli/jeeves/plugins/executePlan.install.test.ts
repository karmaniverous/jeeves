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
  /^openclaw (config set|plugins install|plugins inspect|gateway status)/.exec(
    line,
  )?.[1] ?? line;

const noServerWrite = (): Promise<string> =>
  Promise.reject(new Error('must not write the server config'));

const setup = (runner = fakeRunner(), dryRun = false) => {
  const temp = fakeTempFiles();
  const log: string[] = [];
  const slept: number[] = [];
  let now = 0;
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
    clock: () => now,
    sleep: (ms: number) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    },
  };
  return { ctx, temp, log, slept };
};

const HOOKS = [
  { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
  { path: `${META}.hooks.allowConversationAccess`, value: true },
];

describe('executePlan (install plan order)', () => {
  it('writes all config once, then waits for the gateway before each install', async () => {
    const fake = fakeRunner();
    const { ctx, temp, slept } = setup(fake);
    await executePlan(plan(), ctx);
    expect(fake.lines().map(short)).toEqual([
      'gateway status', // detect a running gateway
      'config set',
      'gateway status', // settle after the config reload
      'plugins install',
      'plugins inspect',
      'gateway status', // settle after the first install's reload
      'plugins install',
      'plugins inspect',
    ]);
    expect(temp.written).toHaveLength(1);
    expect(temp.batch(0)).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
      { path: `${META}.config.configRoot`, value: '/srv/cfg' },
      ...HOOKS,
    ]);
    // Grace pause only after the config write, so its reload has started.
    expect(slept).toEqual([3_000]);
  });

  it('causes one reload-triggering config write in total, none between installs', async () => {
    const fake = fakeRunner();
    const { ctx } = setup(fake);
    await executePlan(plan(), ctx);
    const kinds = fake
      .lines()
      .map(short)
      .filter((k) => k === 'config set' || k === 'plugins install');
    expect(kinds).toEqual(['config set', 'plugins install', 'plugins install']);
  });

  it('grants hook access only to hook-declaring plugins, in the same single config write', async () => {
    const steps = buildInstallPlan(
      [
        { ...target('runner', '1.0.0'), conversationHooks: [] },
        target('watcher', '1.0.0'),
      ],
      {},
      {
        ops: [{ path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' }],
        values: [],
        secrets: [],
        unknownPluginIds: [],
      },
    );
    const fake = fakeRunner();
    const { ctx, temp } = setup(fake);
    await executePlan(steps, ctx);
    expect(
      fake
        .lines()
        .map(short)
        .filter((k) => k === 'config set'),
    ).toHaveLength(1);
    expect(temp.batch(0)).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
      {
        path: 'plugins.entries.jeeves-watcher-openclaw.hooks.allowConversationAccess',
        value: true,
      },
    ]);
  });

  it('waits for a busy gateway between installs', async () => {
    const down = failed('gateway timeout after 10000ms', 1);
    const fake = fakeRunner({
      'openclaw gateway status': [ok(), ok(), down, down, ok()],
    });
    const { ctx, slept, log } = setup(fake);
    await executePlan(plan(), ctx);
    const lines = fake.lines().map(short);
    expect(lines.slice(5, 9)).toEqual([
      'gateway status',
      'gateway status',
      'gateway status',
      'plugins install',
    ]);
    expect(slept).toEqual([3_000, 2_000, 4_000]);
    expect(
      log.filter((l) => l.startsWith('OpenClaw gateway is busy')),
    ).toHaveLength(1);
  });

  it('skips settle waits when no gateway is running', async () => {
    const fake = fakeRunner({
      'openclaw gateway status': failed('gateway not running', 1),
    });
    const { ctx, slept, log } = setup(fake);
    await executePlan(plan(), ctx);
    expect(
      fake.lines().filter((l) => l.startsWith('openclaw gateway status')),
    ).toHaveLength(1);
    expect(slept).toEqual([]);
    expect(log[0]).toMatch(/^no running OpenClaw gateway answered/);
  });

  it('retries a refused pre-install write with a sweep before each wait', async () => {
    const refusal = failed(
      'Cannot edit retained config at "plugins.entries.jeeves-watcher-openclaw.config". Plugin "jeeves-watcher-openclaw" data/settings upgrade is unfinished: x',
    );
    const fake = fakeRunner({
      'openclaw gateway status': failed('not running'),
      'openclaw config set --batch-file': [refusal, ok()],
      'openclaw plugins install': ok(),
    });
    const { ctx, slept } = setup(fake);
    await executePlan(plan(), ctx);
    expect(fake.lines().map(short).slice(0, 6)).toEqual([
      'gateway status',
      'config set',
      'plugins inspect',
      'config set',
      'plugins install',
      'plugins inspect',
    ]);
    expect(slept).toEqual([2_000]);
  });

  it('stops before any install when the pre-install write fails otherwise', async () => {
    const fake = fakeRunner({
      'openclaw config set --batch-file': failed('invalid config', 1),
    });
    const { ctx } = setup(fake);
    await expect(executePlan(plan(), ctx)).rejects.toThrow(/exit 1/);
    expect(fake.lines().map(short)).toEqual(['gateway status', 'config set']);
  });

  it('dry run prints the order and executes nothing', async () => {
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
      'plugins install',
      'plugins inspect',
    ]);
    expect(log[1]).toBe(
      `[dry-run]   batch file content: ${JSON.stringify([
        { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
        { path: `${META}.config.configRoot`, value: '/srv/cfg' },
        ...HOOKS,
      ])}`,
    );
  });
});
