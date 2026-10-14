import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverSkillNames } from './skillsFolders.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'jeeves-shadow-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write `<dir>/SKILL.md`, with frontmatter naming `name` unless omitted. */
function skill(dir: string, name?: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'SKILL.md'),
    name === undefined
      ? '# no frontmatter\n'
      : `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`,
  );
}

describe('discoverSkillNames', () => {
  it('finds flat and grouped skills, named by frontmatter or folder', () => {
    skill(path.join(root, 'jeeves-platform'), 'jeeves-platform');
    skill(path.join(root, 'group', 'jeeves-coding'), 'jeeves-coding');
    skill(path.join(root, 'renamed-folder'), 'jeeves-design');
    skill(path.join(root, 'bare'));

    expect(discoverSkillNames(root)).toEqual([
      'bare',
      'jeeves-coding',
      'jeeves-design',
      'jeeves-platform',
    ]);
  });

  it('stops at the first SKILL.md and below 6 levels', () => {
    skill(path.join(root, 'outer'), 'outer');
    skill(path.join(root, 'outer', 'inner'), 'inner');
    skill(path.join(root, 'a', 'b', 'c', 'd', 'e', 'six'), 'six');
    skill(path.join(root, 'a', 'b', 'c', 'd', 'e', 'f', 'seven'), 'seven');

    expect(discoverSkillNames(root)).toEqual(['outer', 'six']);
  });

  it('follows directory symlinks and junctions, as in plugin-skills/', () => {
    const target = path.join(root, 'elsewhere', 'jeeves-watcher');
    skill(target, 'jeeves-watcher');
    const index = path.join(root, 'plugin-skills');
    mkdirSync(index);
    symlinkSync(target, path.join(index, 'jeeves-watcher'), 'junction');
    writeFileSync(path.join(index, 'stray-file'), 'x');

    expect(discoverSkillNames(index)).toEqual(['jeeves-watcher']);
  });

  it('yields nothing for a missing root', () => {
    expect(discoverSkillNames(path.join(root, 'nope'))).toEqual([]);
  });
});
