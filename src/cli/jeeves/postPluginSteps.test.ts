import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PatchRunReport } from './openclawPatch/patchRunner.js';
import { runPostPluginSteps, skipPatchFromCli } from './postPluginSteps.js';
import type { RunSkillsOptions } from './skills/skillsCommand.js';

const report = (over: Partial<PatchRunReport> = {}): PatchRunReport => ({
  changed: false,
  failed: false,
  results: [],
  ...over,
});

let order: string[];
let skillsOpts: RunSkillsOptions | undefined;

beforeEach(() => {
  order = [];
  skillsOpts = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Run the steps with recording fakes. */
const run = (
  opts: { dryRun?: boolean; skipPatch?: boolean },
  patch = report(),
  skillsExit = 0,
) =>
  runPostPluginSteps({
    dryRun: opts.dryRun ?? false,
    skipPatch: opts.skipPatch ?? false,
    skillsMode: 'managed',
    runPatches: () => {
      order.push('patch');
      return patch;
    },
    runSkills: (o) => {
      order.push('skills');
      skillsOpts = o;
      return Promise.resolve({ exitCode: skillsExit, changed: false });
    },
  });

describe('runPostPluginSteps', () => {
  it('runs the patch step, then the skills step with the mode and dry-run flag', async () => {
    await run({ dryRun: true });

    expect(order).toEqual(['patch', 'skills']);
    expect(skillsOpts).toEqual({ dryRun: true, mode: 'managed' });
  });

  it('skipPatch skips only the patch step', async () => {
    const result = await run({ skipPatch: true });

    expect(order).toEqual(['skills']);
    expect(result).toEqual({ failed: false, distChanged: false });
  });

  it('reports a live dist change, but not a dry-run one', async () => {
    expect((await run({}, report({ changed: true }))).distChanged).toBe(true);
    expect(
      (await run({ dryRun: true }, report({ changed: true }))).distChanged,
    ).toBe(false);
  });

  it.each([
    ['a patch failure', report({ failed: true }), 0],
    ['a skills failure', report(), 1],
  ])(
    'still runs both steps and reports failed on %s',
    async (_l, patch, exit) => {
      const result = await run({}, patch, exit);

      expect(order).toEqual(['patch', 'skills']);
      expect(result.failed).toBe(true);
    },
  );
});

describe('skipPatchFromCli', () => {
  it.each([
    [{}, false],
    [{ skipPatch: true }, true],
  ])('maps %j to %s', (opts, expected) => {
    expect(skipPatchFromCli(opts)).toBe(expected);
  });
});
