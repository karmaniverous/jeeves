/** `runSkillsCommand install`: wiring each mode, idempotence, stale entries, dry run. */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakeRunner, fakeTempFiles, ok } from '../plugins/fakePorts.js';
import { runSkillsCommand } from './skillsCommand.js';
import { GET, logger, useSkillsFixture } from './skillsTestKit.js';

const fx = useSkillsFixture();

describe('runSkillsCommand install', () => {
  it('fresh install wires both folders (self-hosted default)', async () => {
    const { runner, lines: calls } = fakeRunner({
      [GET]: ok(JSON.stringify({})),
    });
    const temp = fakeTempFiles();
    const { log } = logger();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log,
      packageRoot: fx.pkgRoot,
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          path.join(fx.pkgRoot, 'skills'),
          path.join(fx.pkgRoot, 'skills-self-hosted'),
        ],
      },
    ]);
    expect(
      calls().some((l: string) =>
        l.startsWith('openclaw config set --batch-file'),
      ),
    ).toBe(true);
  });

  it('--managed wires the generic folder only', async () => {
    const { runner } = fakeRunner({ [GET]: ok(JSON.stringify({})) });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      mode: 'managed',
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(fx.pkgRoot, 'skills')],
      },
    ]);
  });

  it('second install is a no-op and makes no mutating call', async () => {
    const extraDirs = [
      path.join(fx.pkgRoot, 'skills'),
      path.join(fx.pkgRoot, 'skills-self-hosted'),
    ];
    const { runner, lines } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();
    const { log, lines: logLines } = logger();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log,
      packageRoot: fx.pkgRoot,
      mode: 'selfHosted',
    });

    expect(result).toEqual({ exitCode: 0, changed: false });
    expect(logLines).toContain('skills install: nothing to change');
    expect(
      lines().some((l: string) => l.startsWith('openclaw config set')),
    ).toBe(false);
    expect(
      lines().some((l: string) => l.startsWith('openclaw config unset')),
    ).toBe(false);
  });

  it('self-hosted -> --managed removes the self-hosted entry', async () => {
    const extraDirs = [
      path.join(fx.pkgRoot, 'skills'),
      path.join(fx.pkgRoot, 'skills-self-hosted'),
    ];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(fx.pkgRoot, 'skills')],
      },
    ]);
  });

  it('managed -> --self-hosted adds the self-hosted entry', async () => {
    const extraDirs = [path.join(fx.pkgRoot, 'skills')];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      mode: 'selfHosted',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          path.join(fx.pkgRoot, 'skills'),
          path.join(fx.pkgRoot, 'skills-self-hosted'),
        ],
      },
    ]);
  });

  it('replaces a stale entry (nvm/Node change)', async () => {
    const stale = path.join(
      'C:',
      'old-node',
      'node_modules',
      '@karmaniverous',
      'jeeves',
      'skills',
    );
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs: [stale] } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(fx.pkgRoot, 'skills')],
      },
    ]);
  });

  it('preserves other entries in order', async () => {
    const extraDirs = ['/alice/skills', '/bob/skills'];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          '/alice/skills',
          '/bob/skills',
          path.join(fx.pkgRoot, 'skills'),
        ],
      },
    ]);
  });

  it('dry-run issues no mutating command', async () => {
    const { runner, lines } = fakeRunner({
      [GET]: ok(JSON.stringify({})),
    });
    const temp = fakeTempFiles();
    const { log, lines: logLines } = logger();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log,
      packageRoot: fx.pkgRoot,
      dryRun: true,
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(
      lines().some((l: string) => l.startsWith('openclaw config set')),
    ).toBe(false);
    expect(
      lines().some((l: string) => l.startsWith('openclaw config unset')),
    ).toBe(false);
    expect(logLines.some((l) => l.includes('dry run'))).toBe(true);
    expect(logLines.some((l) => l.includes('batch file content'))).toBe(true);
  });
});

describe('runSkillsCommand without OpenClaw (#143)', () => {
  const missing = () => Promise.reject(new Error('spawn openclaw ENOENT'));
  const noDist = () => {
    throw new Error('OpenClaw dist directory not found');
  };

  it.each([
    ['status', '  skipped (OpenClaw not installed)'],
    ['uninstall', 'skills uninstall: OpenClaw not installed; skipped'],
  ] as const)('%s skips and exits 0', async (action, line) => {
    const { log, lines } = logger();
    await expect(
      runSkillsCommand(action, {
        runner: missing,
        log,
        packageRoot: fx.pkgRoot,
        resolveDist: noDist,
      }),
    ).resolves.toEqual({ exitCode: 0, changed: false });
    expect(lines).toEqual([line]);
  });

  it('install still fails', async () => {
    const { log } = logger();
    const error = () => undefined;
    const result = await runSkillsCommand('install', {
      runner: missing,
      log,
      error,
      packageRoot: fx.pkgRoot,
      resolveDist: noDist,
    });
    expect(result.exitCode).toBe(1);
  });

  it('uninstall fails when the CLI is missing but a dist resolves', async () => {
    const { log } = logger();
    const error = () => undefined;
    const result = await runSkillsCommand('uninstall', {
      runner: missing,
      log,
      error,
      packageRoot: fx.pkgRoot,
      resolveDist: () => '/g/openclaw/dist',
    });
    expect(result.exitCode).toBe(1);
  });
});
