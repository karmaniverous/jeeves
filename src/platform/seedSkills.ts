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

import codingContent from '../../content/skills/coding.md';
import jeevesContent from '../../content/skills/jeeves.md';
import operationsContent from '../../content/skills/operations.md';
import playbooksContent from '../../content/skills/playbooks.md';
import slackBotProvisionerContent from '../../content/skills/slack-bot-provisioner.md';
import { SKILLS_DIR } from '../constants/paths.js';

/** Map of skill directory name to inlined content. */
const BUNDLED_SKILLS: Record<string, string> = {
  jeeves: jeevesContent,
  coding: codingContent,
  'slack-bot-provisioner': slackBotProvisionerContent,
  operations: operationsContent,
  playbooks: playbooksContent,
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
