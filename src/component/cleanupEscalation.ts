/**
 * Cleanup escalation — request a gateway session to resolve orphaned content.
 *
 * @remarks
 * When cleanup is detected in a managed file, this module attempts to
 * spawn a gateway session to automatically resolve the duplicated content.
 * Fire-and-forget: 200 means accepted, any error falls back silently.
 *
 * @module
 */

import { CLEANUP_FLAG } from '../constants/index.js';

/** Options for requesting a cleanup session. */
export interface CleanupEscalationOptions {
  /** Gateway base URL (e.g., 'http://localhost:3000'). */
  gatewayUrl: string;
  /** Absolute path to the file needing cleanup. */
  filePath: string;
  /** Marker identity (e.g., 'TOOLS', 'SOUL', 'AGENTS'). */
  markerIdentity: string;
}

/**
 * Check whether a file contains the cleanup flag.
 *
 * @param fileContent - The file content to check.
 * @returns `true` if the cleanup flag is present.
 */
export function hasCleanupFlag(fileContent: string): boolean {
  return fileContent.includes(CLEANUP_FLAG);
}

/**
 * Request a cleanup session from the gateway.
 *
 * @remarks
 * Fire-and-forget. Returns `true` if the gateway accepted the request,
 * `false` on any error (network, non-200 status, gateway unavailable).
 *
 * @param options - Cleanup escalation configuration.
 * @returns Whether the session was accepted.
 */
export async function requestCleanupSession(
  options: CleanupEscalationOptions,
): Promise<boolean> {
  const { gatewayUrl, filePath, markerIdentity } = options;
  const label = `cleanup:${filePath}`;
  const task = [
    `Clean up orphaned managed content in ${filePath}.`,
    `The file contains a "${markerIdentity}" managed block delimited by BEGIN/END comment markers.`,
    `Content outside the markers duplicates content inside them.`,
    `Review the file, identify duplicated content outside the markers, and remove it.`,
    `Preserve any unique user-authored content outside the markers.`,
  ].join(' ');

  try {
    const response = await fetch(`${gatewayUrl}/sessions/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, label }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
