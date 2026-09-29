import { describe, expect, it } from 'vitest';

import { executePlan } from './executePlan.js';
import { fakeRunner, fakeTempFiles, ok } from './fakePorts.js';
import { buildInstallPlan, type ResolvedTarget } from './plan.js';
import { parsePluginSpec } from './pluginSpec.js';
import { TRANSIENT_NOISE_NOTE } from './transientNoise.js';

const target = (spec: string, version: string): ResolvedTarget => ({
  ...parsePluginSpec(spec),
  version,
  conversationHooks: [],
});

/** Watcher + meta install plan with one config write. */
const plan = () =>
  buildInstallPlan(
    [target('watcher', '1.0.0'), target('meta', '2.0.0')],
    {},
    {
      ops: [
        {
          path: 'plugins.entries.jeeves-watcher-openclaw.config.configRoot',
          value: '/srv/cfg',
        },
      ],
      values: [],
      secrets: [],
      unknownPluginIds: [],
    },
  );

const setup = (runner = fakeRunner(), dryRun = false) => {
  const log: string[] = [];
  const ctx = {
    runner: runner.runner,
    fs: {
      isDirectory: () => false,
      readPackageName: () => undefined,
      removeDir: () => undefined,
    },
    tempFiles: fakeTempFiles().files,
    serverConfig: () => Promise.reject(new Error('no server write')),
    log: (l: string) => log.push(l),
    dryRun,
    clock: () => 0,
    sleep: () => Promise.resolve(),
  };
  return { ctx, log };
};

describe('executePlan (echoed output and live-apply report)', () => {
  it('filters the echo of every mutating openclaw command, hiding nothing once all are installed', async () => {
    const W_ID = 'jeeves-watcher-openclaw';
    const M_ID = 'jeeves-meta-openclaw';
    const unfinished = (id: string): string =>
      `[state-migrations] Plugin "${id}" data/settings upgrade is unfinished: The configured plugin package is missing or has not converged. status=pending`;
    const fake = fakeRunner();
    const { ctx, log } = setup(fake);
    await executePlan(plan(), ctx);
    const echoed = fake.calls.filter((c) => c.options?.echo === true);
    expect(echoed.map((c) => c.args.slice(0, 2).join(' '))).toEqual([
      'config set',
      'plugins install',
      'plugins install',
    ]);
    const filters = echoed.map((c) => c.options?.echoFilter);
    const both = `${unfinished(W_ID)}\n${unfinished(M_ID)}\nreal warning`;
    // Filters were bound to the live state, which ends with both installed.
    for (const filter of filters) {
      expect(filter?.(both)).toBe(both);
    }
    expect(log.filter((l) => l === TRANSIENT_NOISE_NOTE)).toEqual([]);
  });

  it('suppresses the batch noise before the installs and prints the note once', async () => {
    const warn = (id: string): string =>
      `Config warnings: plugins.entries.${id}: plugin not found: ${id} (stale config entry ignored; remove it from plugins config)`;
    const seen: string[] = [];
    const base = fakeRunner();
    const runner: typeof base.runner = async (command, args, options) => {
      const result = await base.runner(command, args, options);
      if (options?.echoFilter) {
        seen.push(
          options.echoFilter(
            `${warn('jeeves-watcher-openclaw')}\n${warn('jeeves-meta-openclaw')}`,
          ),
        );
      }
      return result;
    };
    const { ctx, log } = setup({ ...base, runner });
    await executePlan(plan(), ctx);
    expect(seen).toEqual([
      '', // config set: neither is installed yet
      '', // watcher install: both still pending
      warn('jeeves-watcher-openclaw'), // meta install: watcher is installed
    ]);
    expect(log.filter((l) => l === TRANSIENT_NOISE_NOTE)).toHaveLength(1);
  });

  it('reports whether OpenClaw applied every change live', async () => {
    const live = fakeRunner({
      'openclaw config set': ok(
        'Updated 4 config paths. Change will apply without restarting the gateway.',
      ),
      'openclaw plugins install npm:@karmaniverous/jeeves-watcher': ok(
        'Applied in Gateway generation 4.',
      ),
      'openclaw plugins install npm:@karmaniverous/jeeves-meta': ok(
        'Applied in Gateway generation 5.',
      ),
    });
    await expect(executePlan(plan(), setup(live).ctx)).resolves.toEqual({
      changes: 3,
      live: 3,
      generations: [4, 5],
    });
    const restart = fakeRunner({
      'openclaw plugins install': ok('Installed plugin.'),
    });
    await expect(executePlan(plan(), setup(restart).ctx)).resolves.toEqual({
      changes: 3,
      live: 0,
      generations: [],
    });
  });

  it('reports nothing for a dry run', async () => {
    await expect(
      executePlan(plan(), setup(fakeRunner(), true).ctx),
    ).resolves.toEqual({
      changes: 0,
      live: 0,
      generations: [],
    });
  });
});
