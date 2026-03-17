/**
 * Shared helpers for the uninstall command.
 *
 * @remarks
 * Extracted for testability — these are the core uninstall operations.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { parseManaged } from '../../managed/parseManaged.js';

/**
 * Remove managed block from a file, keeping user content.
 *
 * @param filePath - Absolute path to the workspace file.
 * @param markers - Begin/end marker pair.
 */
export function removeManagedBlockFromFile(
  filePath: string,
  markers: { begin: string; end: string },
): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf-8');
  const parsed = parseManaged(content, markers);
  if (!parsed.found) return;

  // Reconstruct file with only user content
  const parts: string[] = [];
  if (parsed.beforeContent) {
    parts.push(parsed.beforeContent);
  }
  if (parsed.userContent) {
    if (parts.length > 0) parts.push('');
    parts.push(parsed.userContent);
  }

  const newContent = parts.join('\n').trim() + '\n';
  writeFileSync(filePath, newContent, 'utf-8');
}
