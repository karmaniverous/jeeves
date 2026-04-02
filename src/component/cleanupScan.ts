/**
 * Cleanup flag scanning extracted from ComponentWriter.cycle().
 *
 * @remarks
 * After writing managed files, scans each for the cleanup flag and
 * fires a best-effort escalation request when a gateway URL is configured.
 * Uses a `pendingCleanups` set to deduplicate in-flight requests.
 */

import { readFileSync } from 'node:fs';

import { CLEANUP_FLAG } from '../constants/index.js';
import { requestCleanupSession } from './cleanupEscalation.js';

/** A managed file that may need cleanup. */
export interface CleanupTarget {
  /** Absolute path to the managed file. */
  filePath: string;
  /** Marker identity (e.g. 'TOOLS', 'SOUL', 'AGENTS'). */
  markerIdentity: string;
}

/**
 * Scan managed files for the cleanup flag and escalate when detected.
 *
 * @param targets - Managed files to scan.
 * @param gatewayUrl - Gateway URL for session spawn.
 * @param pendingCleanups - Set tracking in-flight requests (mutated).
 */
export function scanAndEscalateCleanup(
  targets: CleanupTarget[],
  gatewayUrl: string,
  pendingCleanups: Set<string>,
): void {
  for (const target of targets) {
    try {
      if (pendingCleanups.has(target.filePath)) continue;

      const fileContent = readFileSync(target.filePath, 'utf-8');
      if (fileContent.includes(CLEANUP_FLAG)) {
        pendingCleanups.add(target.filePath);
        void requestCleanupSession({
          gatewayUrl,
          filePath: target.filePath,
          markerIdentity: target.markerIdentity,
        }).finally(() => {
          pendingCleanups.delete(target.filePath);
        });
      }
    } catch {
      // Best-effort: don't fail the cycle for escalation issues.
    }
  }
}
