/**
 * Guards for the skills `@karmaniverous/jeeves` ships (spec Decisions 68
 * and 71): every shipped `SKILL.md` carries valid frontmatter whose `name`
 * matches its folder, stays thin, links only to files it ships, and (in the
 * generic `skills/` set) carries
 * no managed-fleet specifics, which belong to jeeves-tools'
 * `jeeves-platform-managed`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPackageRoot } from '../plugin/index.js';
import { validateSkillFrontmatter } from '../plugin/skillFrontmatter.js';

const packageRoot = getPackageRoot(import.meta.url);
if (packageRoot === undefined) throw new Error('package root not found');
const root: string = packageRoot;

/** Upper bound on a SKILL.md body, in characters. */
const MAX_SKILL_CHARS = 20_000;

/**
 * Upper bound on a skill description, in characters. OpenClaw cuts every
 * description in the catalog to a compact form once the full catalog exceeds
 * `skills.limits.maxSkillsPromptChars`, so shipped descriptions stay short.
 */
const MAX_DESCRIPTION_CHARS = 160;

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

/**
 * Relative Markdown link targets in `content`, normalised and without their
 * `#fragment` (URLs, `mailto:` and same-page anchors excluded). Accepts
 * `<target>` and a quoted link title.
 */
const relativeLinks = (content: string): string[] =>
  [...content.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^([a-z][a-z0-9+.-]*:|#)/i.test(target))
    .map((target) => posix.normalize(target.replace(/#.*$/, '')));

/** Files in a skill's `references/` folder (none when it has no folder). */
const referenceFiles = (folder: string, name: string): string[] => {
  const dir = join(root, folder, name, 'references');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

/** A skill's `SKILL.md` followed by each of its reference files' content. */
const skillTexts = (folder: string, name: string): string[] => [
  read(folder, name),
  ...referenceFiles(folder, name).map((file) =>
    readFileSync(join(root, folder, name, 'references', file), 'utf8'),
  ),
];

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

  it('finds only relative link targets', () => {
    expect(
      relativeLinks(
        '[a](references/a.md) [b](https://x.y) [c](#top) [d](mailto:x@y) ' +
          '[e](./references/e.md#3-fix-rules) [f](<references/f.md> "F")',
      ),
    ).toEqual(['references/a.md', 'references/e.md', 'references/f.md']);
  });

  it('points jeeves-coding at jeeves-pr-review', () => {
    expect(read('skills', 'jeeves-coding')).toContain('`jeeves-pr-review`');
  });

  it('includes every shipped skill and its linked files in the npm package', () => {
    const packArgs = ['pack', '--dry-run', '--json', '--ignore-scripts'];
    // Windows runs npm's .cmd shim through cmd.exe explicitly: `shell: true`
    // with an args array is deprecated (DEP0190).
    const [command, args] =
      process.platform === 'win32'
        ? ['cmd.exe', ['/d', '/s', '/c', 'npm', ...packArgs]]
        : ['npm', packArgs];
    const [pack] = JSON.parse(
      execFileSync(command, args, { cwd: root, encoding: 'utf8' }),
    ) as [{ files: { path: string }[] }];
    const files = pack.files.map((file) => file.path);
    for (const folder of ['skills', 'skills-self-hosted'])
      for (const name of skillDirs(folder))
        for (const target of ['SKILL.md', ...relativeLinks(read(folder, name))])
          expect(files).toContain(`${folder}/${name}/${target}`);
  }, 60_000);

  for (const folder of ['skills', 'skills-self-hosted']) {
    for (const name of skillDirs(folder)) {
      describe(`${folder}/${name}`, () => {
        const content = read(folder, name);

        it('has valid frontmatter naming its folder', () => {
          expect(validateSkillFrontmatter(content).name).toBe(name);
        });

        it(`keeps its description within ${String(MAX_DESCRIPTION_CHARS)} characters`, () => {
          expect(
            validateSkillFrontmatter(content).description.length,
          ).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
        });

        it('stays thin', () => {
          expect(content.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
        });

        it('links only to files it ships', () => {
          for (const target of relativeLinks(content))
            expect(existsSync(join(root, folder, name, target))).toBe(true);
        });

        if (folder === 'skills') {
          it('carries no managed-fleet specifics, references included', () => {
            for (const text of skillTexts(folder, name))
              for (const pattern of FLEET_PATTERNS)
                expect(text).not.toMatch(pattern);
          });

          it('links every reference file from its SKILL.md', () => {
            const linked = relativeLinks(content);
            for (const file of referenceFiles(folder, name))
              expect(linked).toContain(`references/${file}`);
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
