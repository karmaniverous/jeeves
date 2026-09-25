/**
 * Probe a platform component's `GET /status` at its resolved URL
 * (read-only HTTP). Shared by `jeeves status` and `jeeves uninstall`.
 *
 * @module
 */

import { getServiceUrl } from '../../discovery/getServiceUrl.js';
import { fetchWithTimeout } from '../../plugin/http.js';
import { isRecord } from '../../utils.js';

/**
 * Probe one component.
 *
 * @param name - Component name (e.g. `watcher`).
 * @param timeoutMs - Probe timeout.
 * @returns The response, or undefined when the service is unreachable (or
 *   its URL cannot be resolved).
 */
export async function probeStatus(
  name: string,
  timeoutMs: number,
): Promise<Response | undefined> {
  try {
    return await fetchWithTimeout(`${getServiceUrl(name)}/status`, timeoutMs);
  } catch {
    return undefined;
  }
}

/**
 * The `version` a `/status` response reports.
 *
 * @param response - A successful `/status` response.
 * @returns The version, or undefined for a non-JSON body or no version.
 */
export async function readStatusVersion(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) && typeof body['version'] === 'string'
      ? body['version']
      : undefined;
  } catch {
    return undefined;
  }
}
