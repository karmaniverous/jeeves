/**
 * Version-stamp parsing and convergence logic.
 *
 * @remarks
 * When multiple component plugins bundle different core library versions,
 * they independently maintain shared managed content. The version-stamp
 * mechanism ensures convergence without coordination state.
 */

import { gte, valid } from 'semver';

import { STALENESS_THRESHOLD_MS } from '../constants/index.js';
import type { VersionStamp } from './parseManaged.js';

/**
 * Format the BEGIN marker comment with a version stamp.
 *
 * @param markerText - The marker text (e.g., 'BEGIN JEEVES PLATFORM TOOLS').
 * @param version - The core library version.
 * @returns Formatted comment line.
 */
export function formatBeginMarker(markerText: string, version: string): string {
  const timestamp = new Date().toISOString();
  return `<!-- ${markerText} | core:${version} | ${timestamp} -->`;
}

/**
 * Format the END marker comment.
 *
 * @param markerText - The marker text (e.g., 'END JEEVES PLATFORM TOOLS').
 * @returns Formatted comment line.
 */
export function formatEndMarker(markerText: string): string {
  return `<!-- ${markerText} -->`;
}

/**
 * Determine whether this writer should proceed based on version-stamp
 * convergence rules.
 *
 * @param myVersion - The current core library version.
 * @param existing - The existing version stamp (if any).
 * @param stalenessThresholdMs - Staleness threshold in ms (default: 5 min).
 * @returns `true` if the writer should proceed with the write.
 */
export function shouldWrite(
  myVersion: string,
  existing: VersionStamp | undefined,
  stalenessThresholdMs: number = STALENESS_THRESHOLD_MS,
): boolean {
  // Always write when version comparison is impossible: invalid/placeholder
  // versions (dev/test mode) or no existing stamp to compare against.
  if (!valid(myVersion) || !existing || !valid(existing.version)) return true;

  // My version >= stamped version — always write (I'm current or newer)
  if (gte(myVersion, existing.version)) return true;

  // My version < stamped version — check staleness
  const stampAge = Date.now() - new Date(existing.timestamp).getTime();
  return stampAge >= stalenessThresholdMs;
}
