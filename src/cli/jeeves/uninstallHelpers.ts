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
 * @returns `true` if a block was removed.
 */
export function removeManagedBlockFromFile(
  filePath: string,
  markers: Pick<ManagedMarkers, 'begin' | 'end'>,
): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  const updated = removeManagedBlock(content, markers);
  if (updated === content) return false;
  writeFileSync(filePath, updated, 'utf-8');
  return true;
}
