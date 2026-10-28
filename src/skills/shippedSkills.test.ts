/**
 * Guards for the skills `@karmaniverous/jeeves` ships (spec Decisions 68
 * and 71): every shipped `SKILL.md` carries valid frontmatter whose `name`
 * matches its folder, stays thin, and (in the generic `skills/` set) carries
 * no managed-fleet specifics, which belong to jeeves-tools'
 * `jeeves-platform-managed`.
 */

import { execFileSync } from 'node:child_process';
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
  /\/opt\//,
  /jeeves-tools (config set|deploy)/,
  /systemd unit/i,
];

/** Managed-fleet / operator-driven detail forbidden in the self-hosted onboarding skill. */
const SELF_HOSTED_FORBIDDEN_PATTERNS = [
  /\/opt\/jeeves/,
  /jeeves-tools config set/,
  /jeeves-tools deploy/,
  /operator/,
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
      expect.arrayContaining([
        'aws-ssm-remote-ops',
        'jeeves-coding',
        'jeeves-design',
        'jeeves-platform',
        'jeeves-pr-review',
      ]),
    );
  });

  it('catches managed-fleet paths such as /opt/dev', () => {
    const caught = (text: string) => FLEET_PATTERNS.some((p) => p.test(text));
    expect(caught('clone into /opt/dev/org/repo')).toBe(true);
    expect(caught('/opt/jeeves/config')).toBe(true);
    expect(caught('a designated dev repos directory')).toBe(false);
  });

  it('points jeeves-coding at jeeves-pr-review', () => {
    expect(read('skills', 'jeeves-coding')).toContain('`jeeves-pr-review`');
  });

  it('includes every shipped skill in the npm package', () => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const [pack] = JSON.parse(
      execFileSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: root,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      }),
    ) as [{ files: { path: string }[] }];
    const files = pack.files.map((file) => file.path);
    for (const folder of ['skills', 'skills-self-hosted'])
      for (const name of skillDirs(folder))
        expect(files).toContain(`${folder}/${name}/SKILL.md`);
  }, 60_000);

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

  it('ships the self-hosted jeeves-onboarding skill', () => {
    expect(skillDirs('skills-self-hosted')).toEqual(
      expect.arrayContaining(['jeeves-onboarding']),
    );
  });

  it('ships the jeeves-onboarding checklist template', () => {
    const refs = join(
      root,
      'skills-self-hosted',
      'jeeves-onboarding',
      'references',
    );
    expect(readdirSync(refs)).toContain('onboarding-checklist.md');
  });

  it('keeps jeeves-onboarding free of managed/operator content', () => {
    const skill = read('skills-self-hosted', 'jeeves-onboarding');
    const template = readFileSync(
      join(
        root,
        'skills-self-hosted',
        'jeeves-onboarding',
        'references',
        'onboarding-checklist.md',
      ),
      'utf8',
    );
    for (const pattern of SELF_HOSTED_FORBIDDEN_PATTERNS) {
      expect(skill).not.toMatch(pattern);
      expect(template).not.toMatch(pattern);
    }
  });
});
