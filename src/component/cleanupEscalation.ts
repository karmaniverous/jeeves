/**
 * Cleanup-session escalation for managed files with orphaned duplicated content.
 *
 * @remarks
 * When a managed file contains the cleanup flag, the writer can ask the
 * OpenClaw gateway to spawn a background session to remove orphaned content.
 * The request is best-effort: accepted requests return `true`; any transport
 * or HTTP failure returns `false` so the file warning remains the fallback.
 */

import { basename } from 'node:path';

import { fetchWithTimeout } from '../plugin/http.js';

/** Timeout for cleanup-session spawn requests. */
const CLEANUP_REQUEST_TIMEOUT_MS = 5_000;

/** Options for requesting a cleanup session. */
export interface CleanupEscalationOptions {
  /** Gateway base URL (e.g. `http://127.0.0.1:3000`). */
  gatewayUrl: string;
  /** Absolute path to the managed file that needs cleanup. */
  filePath: string;
  /** Managed marker identity for the file (e.g. `TOOLS`, `SOUL`, `AGENTS`). */
  markerIdentity: string;
}

/**
 * Build the cleanup task prompt sent to the gateway session API.
 *
 * @param filePath - Managed file requiring cleanup.
 * @param markerIdentity - Marker identity for the file.
 * @returns Cleanup instructions for the spawned session.
 */
function buildCleanupTask(filePath: string, markerIdentity: string): string {
  return [
    `Clean up orphaned managed content in ${filePath}.`,
    `The file uses ${markerIdentity} managed comment markers.`,
    'Review content outside the managed block and remove only duplicated managed content.',
    'Preserve any unique user-authored content outside the managed block.',
    'Do not modify content inside the managed block unless required to preserve valid marker structure.',
  ].join(' ');
}

/**
 * Request a cleanup session from the OpenClaw gateway.
 *
 * @remarks
 * Fire-and-forget. A 200-class response means the request was accepted.
 * Any HTTP or transport failure returns `false` so the file-level cleanup
 * warning remains the only signal.
 *
 * @param options - Cleanup request configuration.
 * @returns Whether the gateway accepted the cleanup request.
 */
export async function requestCleanupSession(
  options: CleanupEscalationOptions,
): Promise<boolean> {
  const { gatewayUrl, filePath, markerIdentity } = options;
  const url = `${gatewayUrl.replace(/\/$/, '')}/sessions/spawn`;
  const label = `cleanup:${basename(filePath)}`;
  const body = {
    task: buildCleanupTask(filePath, markerIdentity),
    label,
  };

  try {
    const response = await fetchWithTimeout(url, CLEANUP_REQUEST_TIMEOUT_MS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}
