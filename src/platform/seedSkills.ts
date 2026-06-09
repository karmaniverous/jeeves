/**
 * Skill seeding: write all bundled platform skills to the workspace.
 *
 * @remarks
 * Skill files are entirely generated — no user-authored content (Decision 48).
 * Every installer (core CLI and component plugins) writes them unconditionally.
 * Content is inlined at build time via `rollup-plugin-md.ts`.
 *
 * @module
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import jeevesCodingContent from '../../content/skills/jeeves-coding.md';
import jeevesPlatformContent from '../../content/skills/jeeves-platform.md';
import { SKILLS_DIR } from '../constants/paths.js';

/** Map of skill directory name to inlined content. */
const BUNDLED_SKILLS: Record<string, string> = {
  'jeeves-platform': jeevesPlatformContent,
  'jeeves-coding': jeevesCodingContent,
};

/**
 * Seed all bundled platform skills into the workspace.
 *
 * @remarks
 * Writes each skill to `{workspace}/skills/{name}/SKILL.md`, creating
 * directories as needed. Overwrites existing content unconditionally.
 *
 * @param workspacePath - Workspace root directory.
 */
export function seedSkills(workspacePath: string): void {
  for (const [name, content] of Object.entries(BUNDLED_SKILLS)) {
    const skillDir = join(workspacePath, SKILLS_DIR, name);
    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }
    writeFileSync(join(skillDir, 'SKILL.md'), content, 'utf-8');
  }
}
