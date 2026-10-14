/**
 * Filesystem resolution for this package's two shipped skill folders
 * (Decision 71): `skills/` (generic, every instance) and
 * `skills-self-hosted/` (non-managed instances only), and the one skill
 * discovery used for them and for every other skill source.
 *
 * @remarks
 * Discovery mirrors OpenClaw's grouped layout: a skill is any directory
 * holding a `SKILL.md`, found up to 6 levels below a root, with traversal
 * stopping at the first `SKILL.md`. Its name is the frontmatter `name`, or
 * the directory name when the frontmatter is missing or invalid.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';

import { validateSkillFrontmatter } from '../../../plugin/skillFrontmatter.js';

/** Name of the generic skills folder (every instance). */
export const GENERIC_SKILLS_DIR = 'skills';

/** Name of the self-hosted-only skills folder. */
export const SELF_HOSTED_SKILLS_DIR = 'skills-self-hosted';

/** Absolute paths of this package's two skill folders. */
export interface SkillsFolders {
  /** `<packageRoot>/skills`. */
  generic: string;
  /** `<packageRoot>/skills-self-hosted`. */
  selfHosted: string;
}

/**
 * Resolve this package's two skill folders from its root.
 *
 * @param packageRoot - Absolute path to this package's root (from
 *   `getPackageRoot(import.meta.url)`).
 * @returns The two folder paths.
 */
export function resolveSkillsFolders(packageRoot: string): SkillsFolders {
  return {
    generic: path.join(packageRoot, GENERIC_SKILLS_DIR),
    selfHosted: path.join(packageRoot, SELF_HOSTED_SKILLS_DIR),
  };
}

/** How deep below a root OpenClaw looks for `SKILL.md` (grouped layouts). */
const MAX_DEPTH = 6;

/**
 * A directory's entries, or none when it cannot be read.
 *
 * @param dir - Directory to read.
 * @returns Its entries (empty on any error).
 */
export function readEntries(dir: string): fs.Dirent[] {
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
 * Whether an entry is a directory, following symlinks and junctions
 * (OpenClaw's `plugin-skills/` index is made of them).
 */
function isDirectoryEntry(entry: fs.Dirent, fullPath: string): boolean {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
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
      const child = path.join(dir, entry.name);
      if (!isDirectoryEntry(entry, child)) continue;
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
