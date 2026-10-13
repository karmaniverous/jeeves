import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listSkillNames, resolveSkillsFolders } from './skillsFolders.js';

describe('resolveSkillsFolders', () => {
  it('joins the package root with the two folder names', () => {
    expect(resolveSkillsFolders('/pkg')).toEqual({
      generic: path.join('/pkg', 'skills'),
      selfHosted: path.join('/pkg', 'skills-self-hosted'),
    });
  });
});

describe('listSkillNames', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns sorted subfolders that contain a SKILL.md', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'jeeves-skills-'));
    mkdirSync(path.join(dir, 'zeta'));
    writeFileSync(path.join(dir, 'zeta', 'SKILL.md'), '# zeta');
    mkdirSync(path.join(dir, 'alpha'));
    writeFileSync(path.join(dir, 'alpha', 'SKILL.md'), '# alpha');
    mkdirSync(path.join(dir, 'no-skill-md'));
    writeFileSync(path.join(dir, 'not-a-dir.txt'), 'x');

    expect(listSkillNames(dir)).toEqual(['alpha', 'zeta']);
  });

  it('returns an empty list for a missing folder', () => {
    expect(
      listSkillNames(path.join(tmpdir(), 'does-not-exist-jeeves')),
    ).toEqual([]);
  });
});
