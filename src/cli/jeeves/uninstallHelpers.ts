/**
 * Platform artifact removal for `jeeves uninstall` (the counterpart of
 * `installPlatformContent.ts`).
 *
 * @remarks
 * Separate from the command so the file operations are testable without
 * the CLI. Never deletes the workspace `skills/` directory or the core
 * config `templates/` directory: core no longer writes either (both ship
 * with jeeves-tools), so files there belong to someone else.
 *
 * @module
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGENTS_MARKERS,
  LEGACY_TOOLS_MARKERS,
  type ManagedMarkers,
  SOUL_MARKERS,
  WORKSPACE_FILES,
} from '../../constants/index.js';
import { removeManagedBlock } from '../../managed/managedBlock.js';

/**
 * Remove a managed block from a file, keeping user content.
 *
 * @param filePath - Absolute path to the workspace file.
 * @param markers - Begin/end marker pair.
 * @param dryRun - Only report whether a block would be removed.
 * @returns `true` if a block was (or would be) removed.
 */
export function removeManagedBlockFromFile(
  filePath: string,
  markers: Pick<ManagedMarkers, 'begin' | 'end'>,
  dryRun = false,
): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  const updated = removeManagedBlock(content, markers);
  if (updated === content) return false;
  if (!dryRun) writeFileSync(filePath, updated, 'utf-8');
  return true;
}

/** Workspace files that may carry a managed block (incl. legacy TOOLS.md). */
const MANAGED_FILES = [
  [WORKSPACE_FILES.soul, SOUL_MARKERS],
  [WORKSPACE_FILES.agents, AGENTS_MARKERS],
  [WORKSPACE_FILES.legacyTools, LEGACY_TOOLS_MARKERS],
] as const;

/**
 * Remove the managed blocks and the config schema.
 *
 * @param workspacePath - Workspace root.
 * @param coreConfigDir - Core config directory.
 * @param dryRun - Only report what would be removed.
 * @returns Labels of what was (or would be) removed, in order.
 */
export function removePlatformArtifacts(
  workspacePath: string,
  coreConfigDir: string,
  dryRun: boolean,
): string[] {
  const removed: string[] = [];
  for (const [file, markers] of MANAGED_FILES) {
    if (
      removeManagedBlockFromFile(join(workspacePath, file), markers, dryRun)
    ) {
      removed.push(`${file} managed block`);
    }
  }

  const schemaPath = join(coreConfigDir, 'config.schema.json');
  if (existsSync(schemaPath)) {
    if (!dryRun) rmSync(schemaPath);
    removed.push('config schema');
  }
  return removed;
}
