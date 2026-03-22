/**
 * Service discovery, config resolution, and registry cache.
 *
 * @packageDocumentation
 */

export {
  type CoreConfig,
  coreConfigSchema,
  generateJsonSchema,
  loadConfig,
} from './config.js';
export { getServiceUrl } from './getServiceUrl.js';
export { checkRegistryVersion } from './registry.js';
