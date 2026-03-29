/**
 * Platform constants — ports, sections, paths, and markers.
 *
 * @packageDocumentation
 */

export {
  AGENTS_MARKERS,
  ALL_MARKERS,
  CLEANUP_FLAG,
  type ManagedMarkers,
  SOUL_MARKERS,
  STALENESS_THRESHOLD_MS,
  TOOLS_MARKERS,
  VERSION_STAMP_PATTERN,
} from './markers.js';
export {
  COMPONENT_CONFIG_PREFIX,
  COMPONENT_VERSIONS_FILE,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
  REGISTRY_CACHE_FILE,
  TEMPLATES_DIR,
  WORKSPACE_FILES,
} from './paths.js';
export {
  DEFAULT_PORTS,
  META_PORT,
  RUNNER_PORT,
  SERVER_PORT,
  WATCHER_PORT,
} from './ports.js';
export {
  PLATFORM_COMPONENTS,
  type PlatformComponent,
  SECTION_IDS,
  SECTION_ORDER,
  type SectionId,
} from './sections.js';
export { CORE_VERSION } from './version.js';
