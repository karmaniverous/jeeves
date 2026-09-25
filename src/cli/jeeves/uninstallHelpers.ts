/**
 * Shared helpers for the uninstall command.
 *
 * @remarks
 * Extracted for testability — these are the core uninstall operations.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { ManagedMarkers } from '../../constants/index.js';
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
