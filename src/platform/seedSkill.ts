/**
 * Skill seeding: write the `jeeves` workspace skill unconditionally.
 *
 * @remarks
 * The skill file is entirely generated — no user-authored content (Decision 48).
 * Every installer (core CLI and component plugins) writes it unconditionally.
 * Content is inlined at build time via `rollup-plugin-md.ts`.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import skillContent from '../../content/skill.md';
import { JEEVES_SKILL_DIR, SKILLS_DIR } from '../constants/paths.js';

/**
 * Seed the jeeves workspace skill file.
 *
 * @param workspacePath - Workspace root directory.
 */
export function seedSkill(workspacePath: string): void {
  const skillDir = join(workspacePath, SKILLS_DIR, JEEVES_SKILL_DIR);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }

  const skillPath = join(skillDir, 'SKILL.md');
  writeFileSync(skillPath, skillContent, 'utf-8');
}
