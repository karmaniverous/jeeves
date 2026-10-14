/**
 * Tests for what `jeeves update` does after plugins: how it calls the
 * shared post-plugin steps (their ordering, skipping and failure handling
 * are unit-tested in `postPluginSteps.test.ts`), the restart notice and
 * the exit code. Child processes are faked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POST_PLUGIN_RESULT,
  useCommandTest,
} from './commandTestHarness.js';
import { fakeRunner, ok } from './plugins/fakePorts.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import {
  type CommandTestPorts,
  npmRecord,
  W,
  WPKG,
} from './plugins/workflowTestKit.js';
import type * as PostPluginModule from './postPluginSteps.js';
import { registerUpdateCommand } from './updateCommand.js';

const state = vi.hoisted((): CommandTestPorts => ({}));
const postMock = vi.hoisted(() => vi.fn());

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  const { createServerConfigWriter } =
    await import('./plugins/serverConfigWrite.js');
  const { commandWorkflowDeps } = await import('./plugins/workflowTestKit.js');
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean) =>
      commandWorkflowDeps(state, createServerConfigWriter(), dryRun),
  };
});

vi.mock('./postPluginSteps.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PostPluginModule>()),
  runPostPluginSteps: postMock,
}));

describe('jeeves update (post-plugin steps)', () => {
  const { out, run, mutations, restartNotices } = useCommandTest(state, {
    prefix: 'jeeves-update-steps-',
    register: registerUpdateCommand,
    command: 'update',
    baseArgs: ({ dir }) => ['-w', dir],
  });

  // The watcher plugin is current and fully configured, so plugins change
  // nothing and only the post-plugin steps can.
  beforeEach(() => {
    postMock.mockReset().mockResolvedValue(DEFAULT_POST_PLUGIN_RESULT);
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': ok(
        JSON.stringify({
          entries: {
            [W]: { config: { configRoot: '/cfg', apiUrl: 'http://h:1' } },
          },
        }),
      ),
      'openclaw plugins inspect --all --json': ok(
        JSON.stringify([npmRecord(W, WPKG, '0.16.0')]),
      ),
      [`npm view ${WPKG}`]: ok('"0.16.0"'),
      [`npm view ${WPKG}@0.16.0 jeeves.conversationHooks`]: ok(''),
    });
  });

  it.each([
    [[], { dryRun: false, skipPatch: false }],
    [['--dry-run'], { dryRun: true, skipPatch: false }],
    [['--skip-patch'], { dryRun: false, skipPatch: true }],
    [['--managed'], { dryRun: false, skipPatch: false, skillsMode: 'managed' }],
    [
      ['--self-hosted', '--dry-run'],
      { dryRun: true, skipPatch: false, skillsMode: 'selfHosted' },
    ],
  ])('passes %j through as %j', async (args, expected) => {
    await run(...args);
    expect(postMock).toHaveBeenCalledExactlyOnceWith(expected);
    expect(mutations()).toEqual([]);
    expect(restartNotices()).toBe(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the restart notice once when only the dist changed', async () => {
    postMock.mockResolvedValue({ failed: false, distChanged: true });
    await run();
    expect(mutations()).toEqual([]);
    expect(restartNotices()).toBe(1);
  });

  it('finishes its work and exits non-zero when a step fails', async () => {
    postMock.mockResolvedValue({ failed: true, distChanged: false });
    await run();
    expect(out).toContain('✅ Plugins already up to date.');
    expect(process.exitCode).toBe(1);
  });

  it('rejects --managed with --self-hosted before running the steps', async () => {
    await expect(run('--managed', '--self-hosted')).rejects.toThrow();
    expect(postMock).not.toHaveBeenCalled();
    expect(mutations()).toEqual([]);
  });
});
