/**
 * Service discovery, config resolution, registry cache, and health probing.
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
export { probeAllServices, type ProbeResult, probeService } from './probe.js';
export { checkRegistryVersion } from './registry.js';
