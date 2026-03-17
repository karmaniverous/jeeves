/**
 * Service URL resolution.
 *
 * @remarks
 * Resolves the URL for a named Jeeves service using the following
 * resolution order:
 * 1. Consumer's own component config
 * 2. Core config (`{configRoot}/jeeves-core/config.json`)
 * 3. Default port constants
 */

import { DEFAULT_PORTS } from '../constants/ports.js';
import { getComponentConfigDir, getCoreConfigDir } from '../init.js';
import { loadConfig } from './config.js';

/**
 * Resolve the URL for a named Jeeves service.
 *
 * @param serviceName - The service name (e.g., 'watcher', 'runner').
 * @param consumerName - Optional consumer component name for config override.
 * @returns The resolved service URL.
 * @throws Error if `init()` has not been called or the service is unknown.
 */
export function getServiceUrl(
  serviceName: string,
  consumerName?: string,
): string {
  // 1. Check consumer's own config
  if (consumerName) {
    const consumerDir = getComponentConfigDir(consumerName);
    const consumerConfig = loadConfig(consumerDir);
    const consumerUrl = consumerConfig?.services[serviceName]?.url;
    if (consumerUrl) return consumerUrl;
  }

  // 2. Check core config
  const coreDir = getCoreConfigDir();
  const coreConfig = loadConfig(coreDir);
  const coreUrl = coreConfig?.services[serviceName]?.url;
  if (coreUrl) return coreUrl;

  // 3. Fall back to port constants
  const port: number | undefined = DEFAULT_PORTS[serviceName] as
    | number
    | undefined;
  if (port !== undefined) {
    return `http://127.0.0.1:${String(port)}`;
  }

  throw new Error(
    `jeeves-core: unknown service "${serviceName}" and no config found`,
  );
}
