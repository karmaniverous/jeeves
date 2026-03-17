/**
 * HTTP health probing for Jeeves platform services.
 *
 * @remarks
 * Probes service ports for health endpoints (HTTP GET to /status or /health).
 * Returns structured health data for rendering into TOOLS.md Platform section.
 */

import { DEFAULT_PORTS } from '../constants/ports.js';
import { getServiceUrl } from './getServiceUrl.js';

/** Health probe result for a single service. */
export interface ProbeResult {
  /** Service name (e.g., 'server', 'watcher'). */
  name: string;
  /** Port number. */
  port: number;
  /** Whether the service responded successfully. */
  healthy: boolean;
  /** Service version from the health response, if available. */
  version?: string;
  /** Error message if the probe failed. */
  error?: string;
}

/**
 * Extract port number from a URL string.
 *
 * @param url - Service URL.
 * @returns Port number.
 */
function extractPort(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.port ? parseInt(parsed.port, 10) : 80;
  } catch {
    return 0;
  }
}

/**
 * Probe a single service for health.
 *
 * @param serviceName - The service name (e.g., 'server', 'watcher').
 * @param consumerName - Optional consumer name for URL resolution.
 * @param timeoutMs - Request timeout in milliseconds (default 3000).
 * @returns Probe result.
 */
export async function probeService(
  serviceName: string,
  consumerName?: string,
  timeoutMs = 3000,
): Promise<ProbeResult> {
  const url = getServiceUrl(serviceName, consumerName);
  const port = extractPort(url);

  const endpoints = ['/status', '/health'];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const response = await fetch(`${url}${endpoint}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        let version: string | undefined;
        try {
          const body: unknown = await response.json();
          if (
            typeof body === 'object' &&
            body !== null &&
            'version' in body &&
            typeof (body as Record<string, unknown>)['version'] === 'string'
          ) {
            version = (body as Record<string, unknown>)['version'] as string;
          }
        } catch {
          // Non-JSON response is fine — we just don't get version info
        }
        return { name: serviceName, port, healthy: true, version };
      }
    } catch {
      // Try next endpoint
    }
  }

  return { name: serviceName, port, healthy: false };
}

/**
 * Probe all known Jeeves services for health.
 *
 * @param consumerName - Optional consumer name for URL resolution.
 * @param timeoutMs - Request timeout in milliseconds (default 3000).
 * @returns Array of probe results for all services.
 */
export async function probeAllServices(
  consumerName?: string,
  timeoutMs = 3000,
): Promise<ProbeResult[]> {
  const serviceNames = Object.keys(DEFAULT_PORTS);
  const results = await Promise.all(
    serviceNames.map((name) => probeService(name, consumerName, timeoutMs)),
  );
  return results;
}
