/**
 * Filesystem resolution for this package's two shipped skill folders
 * (Decision 71): `skills/` (generic, every instance) and
 * `skills-self-hosted/` (non-managed instances only).
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';

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

/**
 * The skill names a folder provides: its subfolders containing a
 * `SKILL.md`, sorted. Never throws; a missing or unreadable folder yields
 * no skills.
 *
 * @param dir - Folder to scan (a skills folder, generic or self-hosted, or
 *   a workspace `skills/` directory).
 * @returns Skill names, sorted.
 */
export function listSkillNames(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (e) =>
        e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')),
    )
    .map((e) => e.name)
    .sort();
}
