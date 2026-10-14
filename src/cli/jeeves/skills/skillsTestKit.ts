/**
 * Shared fixture for the `runSkillsCommand` tests: a fake package root
 * with one skill in each shipped folder, a temp workspace `skills/`
 * folder, and a line-capturing logger. Test-only.
 *
 * @module
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach } from 'vitest';

/** `config get` for the skills slice. */
export const GET = 'openclaw config get skills --json';

/** OpenClaw's "not set" response for the skills slice. */
export const UNSET_NOT_SET = {
  error: { message: 'Config path is valid but unset: skills' },
};

/** Create `<dir>/<name>/SKILL.md`. */
export function makeSkill(dir: string, name: string): void {
  mkdirSync(path.join(dir, name), { recursive: true });
  writeFileSync(path.join(dir, name, 'SKILL.md'), `# ${name}`);
}

/** A logger that records every line. */
export function logger(): { log: (l: string) => void; lines: string[] } {
  const lines: string[] = [];
  return {
    log: (l) => {
      lines.push(l);
    },
    lines,
  };
}

/** Per-test fixture paths. */
export interface SkillsFixture {
  /** Fake package root holding `skills/` and `skills-self-hosted/`. */
  pkgRoot: string;
  /** A temp folder standing in for the workspace `skills/`. */
  workspaceSkillsDir: string;
}

/**
 * Register hooks that build and remove the fixture around each test.
 *
 * @returns The fixture (its paths are refreshed per test).
 */
export function useSkillsFixture(): SkillsFixture {
  const fx: SkillsFixture = { pkgRoot: '', workspaceSkillsDir: '' };
  beforeEach(() => {
    fx.pkgRoot = mkdtempSync(path.join(tmpdir(), 'jeeves-pkg-'));
    mkdirSync(path.join(fx.pkgRoot, 'skills'));
    mkdirSync(path.join(fx.pkgRoot, 'skills-self-hosted'));
    makeSkill(path.join(fx.pkgRoot, 'skills'), 'jeeves-platform');
    makeSkill(path.join(fx.pkgRoot, 'skills-self-hosted'), 'jeeves-onboarding');
    fx.workspaceSkillsDir = mkdtempSync(
      path.join(tmpdir(), 'jeeves-ws-skills-'),
    );
  });
  afterEach(() => {
    rmSync(fx.pkgRoot, { recursive: true, force: true });
    rmSync(fx.workspaceSkillsDir, { recursive: true, force: true });
  });
  return fx;
}
