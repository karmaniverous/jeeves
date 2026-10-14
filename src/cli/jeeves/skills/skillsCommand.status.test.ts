/** `runSkillsCommand uninstall` and `status`. */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { failed, fakeRunner, fakeTempFiles, ok } from '../plugins/fakePorts.js';
import { runSkillsCommand } from './skillsCommand.js';
import {
  GET,
  logger,
  makeSkill,
  UNSET_NOT_SET,
  useSkillsFixture,
} from './skillsTestKit.js';

const fx = useSkillsFixture();

describe('runSkillsCommand uninstall', () => {
  it("removes only this package's entries and unsets when empty", async () => {
    const extraDirs = [
      path.join(fx.pkgRoot, 'skills'),
      path.join(fx.pkgRoot, 'skills-self-hosted'),
    ];
    const { runner, lines } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
      'openclaw config unset': ok(),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('uninstall', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(lines()).toContain('openclaw config unset skills.load');
  });

  it("preserves other users' entries", async () => {
    const extraDirs = ['/alice/skills', path.join(fx.pkgRoot, 'skills')];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('uninstall', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      { path: 'skills.load.extraDirs', value: ['/alice/skills'] },
    ]);
  });
});

describe('runSkillsCommand status', () => {
  it('reports mode, folders, provided skills and shadowing; exits 0', async () => {
    const extraDirs = [
      path.join(fx.pkgRoot, 'skills'),
      path.join(fx.pkgRoot, 'skills-self-hosted'),
    ];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    makeSkill(fx.workspaceSkillsDir, 'jeeves-onboarding');
    const { log, lines } = logger();

    const result = await runSkillsCommand('status', {
      runner,
      log,
      packageRoot: fx.pkgRoot,
      shadowSources: [
        { label: 'workspace skills/', dir: fx.workspaceSkillsDir },
      ],
    });

    expect(result).toEqual({ exitCode: 0, changed: false });
    expect(lines[0]).toBe('mode: self-hosted');
    expect(lines).toContain(
      `skills/: ${path.join(fx.pkgRoot, 'skills')} — wired`,
    );
    expect(lines).toContain('  jeeves-platform');
    expect(lines).toContain('  jeeves-onboarding (also in: workspace skills/)');
  });

  it('reports a stale folder without failing', async () => {
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

    const result = await runSkillsCommand('status', {
      runner,
      log: () => undefined,
      packageRoot: fx.pkgRoot,
      shadowSources: [
        { label: 'workspace skills/', dir: fx.workspaceSkillsDir },
      ],
    });

    expect(result.exitCode).toBe(0);
  });

  it('tolerates an unset skills config', async () => {
    const { runner } = fakeRunner({
      // OpenClaw reports an unset path as JSON on stdout with a non-zero exit.
      [GET]: { exitCode: 1, stdout: JSON.stringify(UNSET_NOT_SET), stderr: '' },
    });
    const { log, lines } = logger();

    const result = await runSkillsCommand('status', {
      runner,
      log,
      packageRoot: fx.pkgRoot,
      shadowSources: [
        { label: 'workspace skills/', dir: fx.workspaceSkillsDir },
      ],
    });

    expect(result).toEqual({ exitCode: 0, changed: false });
    expect(lines[0]).toBe('mode: self-hosted');
  });

  it('fails when openclaw itself cannot be read', async () => {
    const { runner } = fakeRunner({ [GET]: failed('boom', 1) });
    const errors: string[] = [];

    const result = await runSkillsCommand('status', {
      runner,
      log: () => undefined,
      error: (l) => errors.push(l),
      packageRoot: fx.pkgRoot,
      shadowSources: [
        { label: 'workspace skills/', dir: fx.workspaceSkillsDir },
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(errors[0]).toContain('skills status: FAILED');
  });
});
