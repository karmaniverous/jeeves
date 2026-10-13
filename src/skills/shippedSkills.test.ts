/**
 * Guards for the skills `@karmaniverous/jeeves` ships (spec Decisions 68
 * and 71): every shipped `SKILL.md` carries valid frontmatter whose `name`
 * matches its folder, stays thin, and (in the generic `skills/` set) carries
 * no managed-fleet specifics, which belong to jeeves-tools'
 * `jeeves-platform-managed`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPackageRoot } from '../plugin/index.js';
import { validateSkillFrontmatter } from '../plugin/skillFrontmatter.js';

const packageRoot = getPackageRoot(import.meta.url);
if (packageRoot === undefined) throw new Error('package root not found');
const root: string = packageRoot;

/** Upper bound on a SKILL.md body, in characters. */
const MAX_SKILL_CHARS = 20_000;

/** Managed-fleet detail that must not appear in a generic skill. */
const FLEET_PATTERNS = [
  /\/opt\/jeeves/,
  /jeeves-tools (config set|deploy)/,
  /systemd unit/i,
];

const skillDirs = (folder: string): string[] => {
  const dir = join(root, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
};

const read = (folder: string, name: string): string =>
  readFileSync(join(root, folder, name, 'SKILL.md'), 'utf8');

describe('shipped skills', () => {
  it('ships the generic skills', () => {
    expect(skillDirs('skills')).toEqual(
      expect.arrayContaining(['jeeves-coding', 'jeeves-design']),
    );
  });

  for (const folder of ['skills', 'skills-self-hosted']) {
    for (const name of skillDirs(folder)) {
      describe(`${folder}/${name}`, () => {
        const content = read(folder, name);

        it('has valid frontmatter naming its folder', () => {
          expect(validateSkillFrontmatter(content).name).toBe(name);
        });

        it('stays thin', () => {
          expect(content.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
        });

        if (folder === 'skills') {
          it('carries no managed-fleet specifics', () => {
            for (const pattern of FLEET_PATTERNS) {
              expect(content).not.toMatch(pattern);
            }
          });
        }
      });
    }
  }

  it('ships the jeeves-design references', () => {
    const refs = join(root, 'skills', 'jeeves-design', 'references');
    expect(readdirSync(refs).sort()).toEqual([
      'spec-to-code-guide.md',
      'spec.md',
    ]);
  });
});
