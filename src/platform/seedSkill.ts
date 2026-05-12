/**
 * Backward-compatible re-export of `seedSkills`.
 *
 * @remarks
 * Delegates to `seedSkills` which seeds all bundled platform skills.
 * Retained for API compatibility with existing component plugins.
 *
 * @module
 */

import { seedSkills } from './seedSkills.js';

/**
 * Seed all bundled platform skills into the workspace.
 *
 * @param workspacePath - Workspace root directory.
 */
export function seedSkill(workspacePath: string): void {
  seedSkills(workspacePath);
}
