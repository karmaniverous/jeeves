/**
 * Tests for what `jeeves install` does after plugins: how it calls the
 * shared post-plugin steps (their ordering, skipping and failure handling
 * are unit-tested in `postPluginSteps.test.ts`), the restart notice, the
 * exit code, and the bootstrap size report. Child processes are faked.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_POST_PLUGIN_RESULT,
  serverPluginScript,
  useCommandTest,
} from './commandTestHarness.js';
import { registerInstallCommand } from './installCommand.js';
import { fakeRunner } from './plugins/fakePorts.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import { type CommandTestPorts, S } from './plugins/workflowTestKit.js';
import type * as PostPluginModule from './postPluginSteps.js';

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

describe('jeeves install (post-plugin steps)', () => {
  const { paths, out, run, restartNotices } = useCommandTest(state, {
    prefix: 'jeeves-install-steps-',
    register: registerInstallCommand,
    command: 'install',
    baseArgs: ({ ws, dir }) => ['server', '-w', ws, '-c', join(dir, 'cfg')],
  });

  // The server plugin is current and fully configured, so plugins change
  // nothing and only the post-plugin steps can.
  beforeEach(() => {
    postMock.mockReset().mockResolvedValue(DEFAULT_POST_PLUGIN_RESULT);
    state.fake = fakeRunner(
      serverPluginScript(
        {
          [S]: {
            config: {
              configRoot: resolve(join(paths.dir, 'cfg')),
              apiUrl: 'http://127.0.0.1:1934',
              pluginKey: 'kept-seed',
            },
          },
        },
        true,
      ),
    );
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
    expect(restartNotices()).toBe(0);
    expect(process.exitCode).toBeUndefined();
  });

  it('skips the steps with --content-only', async () => {
    await run('--content-only');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('prints the restart notice once when the dist changed', async () => {
    postMock.mockResolvedValue({ failed: false, distChanged: true });
    await run();
    expect(restartNotices()).toBe(1);
  });

  it('finishes its work and exits non-zero when a step fails', async () => {
    postMock.mockResolvedValue({ failed: true, distChanged: false });
    await run();
    expect(existsSync(join(paths.ws, 'SOUL.md'))).toBe(true);
    expect(out.some((l) => l.startsWith('Bootstrap files'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('prints the bootstrap report, and --strict fails on a near-limit file', async () => {
    await run();
    expect(out.some((l) => l.startsWith('Bootstrap files'))).toBe(true);
    expect(process.exitCode).toBeUndefined();

    writeFileSync(join(paths.ws, 'MEMORY.md'), 'x'.repeat(19_000));
    await run('--strict');
    expect(out.some((l) => l.includes('MEMORY.md: 19000 / 20000'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});
