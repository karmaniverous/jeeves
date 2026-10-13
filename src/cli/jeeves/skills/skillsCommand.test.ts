import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { failed, fakeRunner, fakeTempFiles, ok } from '../plugins/fakePorts.js';
import { runSkillsCommand } from './skillsCommand.js';

const GET = 'openclaw config get skills --json';
const UNSET_NOT_SET = {
  error: { message: 'Config path is valid but unset: skills' },
};

let pkgRoot: string;
let workspaceSkillsDir: string;

function makeSkill(dir: string, name: string): void {
  mkdirSync(path.join(dir, name), { recursive: true });
  writeFileSync(path.join(dir, name, 'SKILL.md'), `# ${name}`);
}

beforeEach(() => {
  pkgRoot = mkdtempSync(path.join(tmpdir(), 'jeeves-pkg-'));
  mkdirSync(path.join(pkgRoot, 'skills'));
  mkdirSync(path.join(pkgRoot, 'skills-self-hosted'));
  makeSkill(path.join(pkgRoot, 'skills'), 'jeeves-platform');
  makeSkill(path.join(pkgRoot, 'skills-self-hosted'), 'jeeves-onboarding');
  workspaceSkillsDir = mkdtempSync(path.join(tmpdir(), 'jeeves-ws-skills-'));
});

afterEach(() => {
  rmSync(pkgRoot, { recursive: true, force: true });
  rmSync(workspaceSkillsDir, { recursive: true, force: true });
});

function logger(): { log: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return {
    log: (l) => {
      lines.push(l);
    },
    lines,
  };
}

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
      packageRoot: pkgRoot,
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          path.join(pkgRoot, 'skills'),
          path.join(pkgRoot, 'skills-self-hosted'),
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
      packageRoot: pkgRoot,
      mode: 'managed',
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(pkgRoot, 'skills')],
      },
    ]);
  });

  it('second install is a no-op and makes no mutating call', async () => {
    const extraDirs = [
      path.join(pkgRoot, 'skills'),
      path.join(pkgRoot, 'skills-self-hosted'),
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
      packageRoot: pkgRoot,
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
      path.join(pkgRoot, 'skills'),
      path.join(pkgRoot, 'skills-self-hosted'),
    ];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(pkgRoot, 'skills')],
      },
    ]);
  });

  it('managed -> --self-hosted adds the self-hosted entry', async () => {
    const extraDirs = [path.join(pkgRoot, 'skills')];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('install', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: pkgRoot,
      mode: 'selfHosted',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          path.join(pkgRoot, 'skills'),
          path.join(pkgRoot, 'skills-self-hosted'),
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
      packageRoot: pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [path.join(pkgRoot, 'skills')],
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
      packageRoot: pkgRoot,
      mode: 'managed',
    });

    expect(result.changed).toBe(true);
    expect(temp.batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: ['/alice/skills', '/bob/skills', path.join(pkgRoot, 'skills')],
      },
    ]);
  });

  it('--managed with --self-hosted is an error (resolveModeFlag at the CLI layer)', async () => {
    const { resolveModeFlag } = await import('./skillsModel.js');
    expect(() => resolveModeFlag(true, true)).toThrow();
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
      packageRoot: pkgRoot,
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

describe('runSkillsCommand uninstall', () => {
  it("removes only this package's entries and unsets when empty", async () => {
    const extraDirs = [
      path.join(pkgRoot, 'skills'),
      path.join(pkgRoot, 'skills-self-hosted'),
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
      packageRoot: pkgRoot,
    });

    expect(result).toEqual({ exitCode: 0, changed: true });
    expect(lines()).toContain('openclaw config unset skills.load');
  });

  it("preserves other users' entries", async () => {
    const extraDirs = ['/alice/skills', path.join(pkgRoot, 'skills')];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    const temp = fakeTempFiles();

    const result = await runSkillsCommand('uninstall', {
      runner,
      tempFiles: temp.files,
      log: () => undefined,
      packageRoot: pkgRoot,
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
      path.join(pkgRoot, 'skills'),
      path.join(pkgRoot, 'skills-self-hosted'),
    ];
    const { runner } = fakeRunner({
      [GET]: ok(JSON.stringify({ load: { extraDirs } })),
    });
    makeSkill(workspaceSkillsDir, 'jeeves-onboarding');
    const { log, lines } = logger();

    const result = await runSkillsCommand('status', {
      runner,
      log,
      packageRoot: pkgRoot,
      workspaceSkillsDir,
    });

    expect(result).toEqual({ exitCode: 0, changed: false });
    expect(lines[0]).toBe('mode: self-hosted');
    expect(lines).toContain(`skills/: ${path.join(pkgRoot, 'skills')} — wired`);
    expect(lines).toContain('  jeeves-platform');
    expect(lines).toContain(
      '  jeeves-onboarding (shadowed by a workspace skill)',
    );
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
      packageRoot: pkgRoot,
      workspaceSkillsDir,
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
      packageRoot: pkgRoot,
      workspaceSkillsDir,
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
      packageRoot: pkgRoot,
      workspaceSkillsDir,
    });

    expect(result.exitCode).toBe(1);
    expect(errors[0]).toContain('skills status: FAILED');
  });
});
