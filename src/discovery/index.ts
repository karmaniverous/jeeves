/**
 * Service discovery, config resolution, and registry cache.
 *
 * @packageDocumentation
 */

export {
  type CoreConfig,
  coreConfigSchema,
  DEFAULT_BIND_ADDRESS,
  generateJsonSchema,
  loadConfig,
} from './config.js';
export { getBindAddress } from './getBindAddress.js';
export { getServiceState, type ServiceState } from './getServiceState.js';
export { getServiceUrl } from './getServiceUrl.js';
export { checkRegistryVersion } from './registry.js';
