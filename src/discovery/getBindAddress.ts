/**
 * Resolve the bind address for a Jeeves service.
 *
 * @remarks
 * Resolution order (four-tier):
 * 1. Component config `bindAddress` field (if componentName provided)
 * 2. Core config `bindAddress` field
 * 3. `JEEVES_BIND_ADDRESS` environment variable
 * 4. Default: `0.0.0.0`
 */

import { getComponentConfigDir, getCoreConfigDir } from '../init.js';
import { DEFAULT_BIND_ADDRESS, loadConfig } from './config.js';

/**
 * Resolve the bind address for a Jeeves service.
 *
 * @param componentName - Optional component name for component-specific override.
 * @returns The resolved bind address.
 */
export function getBindAddress(componentName?: string): string {
  // Tier 1: Component config (if provided)
  if (componentName) {
    const componentConfig = loadConfig(getComponentConfigDir(componentName));
    if (componentConfig?.bindAddress) {
      return componentConfig.bindAddress;
    }
  }

  // Tier 2: Core config
  const coreConfig = loadConfig(getCoreConfigDir());
  if (coreConfig?.bindAddress) {
    return coreConfig.bindAddress;
  }

  // Tier 3: Environment variable
  const envValue = process.env['JEEVES_BIND_ADDRESS'];
  if (envValue) {
    return envValue;
  }

  // Tier 4: Default
  return DEFAULT_BIND_ADDRESS;
}
