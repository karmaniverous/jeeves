/**
 * Find skills from other OpenClaw skill sources that share a name with one
 * of this package's shipped skills, for `jeeves skills status`.
 *
 * @remarks
 * OpenClaw loads file-backed skills from these sources, highest precedence
 * first (OpenClaw docs, `tools/skills.md`): workspace `skills/`, workspace
 * `.agents/skills/`, `~/.agents/skills`, `<state dir>/skills` (managed),
 * `<state dir>/agents/<id>/agent/workshop-skills`, bundled skills, and
 * last `skills.load.extraDirs` (which includes this package's folders).
 * Every source above `extraDirs` outranks a shipped skill, so a
 * same-named skill there shadows it. Another `extraDirs` entry shares the
 * lowest tier, so a same-named skill there is a name collision. Bundled
 * and Custodian skills ship inside OpenClaw and are not scanned.
 *
 * Discovery mirrors OpenClaw's grouped layout: a skill is any directory
 * holding a `SKILL.md`, found up to 6 levels below a root, with traversal
 * stopping at the first `SKILL.md`. Its name is the frontmatter `name`, or
 * the directory name when the frontmatter is missing or invalid.
 *
 * Read-only and never throws: a missing or unreadable source yields no
 * skills.
 *
 * @module
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateSkillFrontmatter } from '../../../plugin/skillFrontmatter.js';
import { resolveOpenClawConfigDir } from '../plugins/legacyExtensions.js';

/** One skill source to check for same-named skills. */
export interface ShadowSource {
  /** Human-readable label, e.g. `workspace skills/`. */
  label: string;
  /** Root directory to scan. */
  dir: string;
}

/** How deep below a root OpenClaw looks for `SKILL.md` (grouped layouts). */
const MAX_DEPTH = 6;

/** Read a directory's entries, or none when it cannot be read. */
function readEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** The skill name a `SKILL.md` declares, falling back to its folder name. */
function skillName(skillDir: string): string {
  try {
    const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    return validateSkillFrontmatter(content).name;
  } catch {
    return path.basename(skillDir);
  }
}

/**
 * Every skill name under a root, discovered as OpenClaw does.
 *
 * @param root - Skill root to scan.
 * @returns Skill names, sorted and de-duplicated.
 */
export function discoverSkillNames(root: string): string[] {
  const names = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    for (const entry of readEntries(dir)) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (fs.existsSync(path.join(child, 'SKILL.md'))) {
        names.add(skillName(child));
      } else if (depth < MAX_DEPTH) {
        walk(child, depth + 1);
      }
    }
  };
  walk(root, 1);
  return [...names].sort();
}

/** Inputs to {@link defaultShadowSources}. */
export interface ShadowSourceInput {
  /** Workspace root. */
  workspace: string;
  /** Current `skills.load.extraDirs`. */
  extraDirs: readonly string[];
  /** Whether an `extraDirs` entry is one of this package's folders. */
  isOwnEntry: (entry: string) => boolean;
  /** Environment (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Home directory (default `os.homedir()`). */
  home?: string;
}

/**
 * The skill sources that can shadow or collide with this package's skills.
 *
 * @param input - Workspace, wiring and environment.
 * @returns Sources in OpenClaw's precedence order, highest first.
 */
export function defaultShadowSources(input: ShadowSourceInput): ShadowSource[] {
  const env = input.env ?? process.env;
  const home = input.home ?? os.homedir();
  const stateDir = resolveOpenClawConfigDir(env, home);
  const agentsDir = path.join(stateDir, 'agents');
  const workshop = readEntries(agentsDir)
    .filter((e) => e.isDirectory())
    .map((e) => ({
      label: `workshop skills (agent ${e.name})`,
      dir: path.join(agentsDir, e.name, 'agent', 'workshop-skills'),
    }));
  const otherExtraDirs = input.extraDirs
    .filter((entry) => !input.isOwnEntry(entry))
    .map((entry) => ({ label: `extraDirs entry ${entry}`, dir: entry }));

  return [
    {
      label: 'workspace skills/',
      dir: path.join(input.workspace, 'skills'),
    },
    {
      label: 'workspace .agents/skills/',
      dir: path.join(input.workspace, '.agents', 'skills'),
    },
    { label: '~/.agents/skills', dir: path.join(home, '.agents', 'skills') },
    {
      label: `managed skills (${path.join(stateDir, 'skills')})`,
      dir: path.join(stateDir, 'skills'),
    },
    ...workshop,
    ...otherExtraDirs,
  ];
}

/**
 * Map each shipped skill name to the sources that also provide it.
 *
 * @param shipped - Skill names this package ships.
 * @param sources - Sources to scan.
 * @returns Skill name to source labels, for skills found elsewhere only.
 */
export function findShadows(
  shipped: readonly string[],
  sources: readonly ShadowSource[],
): Record<string, string[]> {
  const wanted = new Set(shipped);
  const shadows: Record<string, string[]> = {};
  for (const source of sources) {
    for (const name of discoverSkillNames(source.dir)) {
      if (!wanted.has(name)) continue;
      (shadows[name] ??= []).push(source.label);
    }
  }
  return shadows;
}
