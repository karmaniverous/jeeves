/**
 * Strip foreign managed blocks from content.
 *
 * @remarks
 * Prevents cross-contamination by removing managed blocks that belong
 * to other marker sets. For example, when writing TOOLS.md with TOOLS
 * markers, any SOUL or AGENTS managed blocks found in the user content
 * zone are stripped — they don't belong there.
 *
 * @packageDocumentation
 */

import { ALL_MARKERS, type ManagedMarkers } from '../constants/index.js';
import { escapeForRegex } from './parseManaged.js';

/**
 * Build a regex that matches an entire managed block (BEGIN marker through END marker).
 *
 * @param markers - The marker set to match.
 * @returns A regex that matches the full block including markers.
 */
function buildBlockPattern(markers: ManagedMarkers): RegExp {
  return new RegExp(
    `\\s*<!--\\s*${escapeForRegex(markers.begin)}(?:\\s*\\|[^>]*)?\\s*(?:—[^>]*)?\\s*-->[\\s\\S]*?<!--\\s*${escapeForRegex(markers.end)}\\s*-->\\s*`,
    'g',
  );
}

/**
 * Strip managed blocks belonging to foreign marker sets from content.
 *
 * @param content - The content to clean (typically user content zone).
 * @param currentMarkers - The marker set that owns this file (will NOT be stripped).
 * @returns Content with foreign managed blocks removed.
 */
export function stripForeignMarkers(
  content: string,
  currentMarkers: ManagedMarkers,
): string {
  let result = content;

  for (const markers of ALL_MARKERS) {
    // Skip the current file's own markers
    if (markers.begin === currentMarkers.begin) continue;

    const pattern = buildBlockPattern(markers);
    result = result.replace(pattern, '\n');
  }

  // Clean up multiple blank lines left by removals
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
