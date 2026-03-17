/**
 * Platform constants — ports, sections, paths, and markers.
 *
 * @packageDocumentation
 */

export {
  AGENTS_MARKERS,
  CLEANUP_FLAG,
  SOUL_MARKERS,
  STALENESS_THRESHOLD_MS,
  TOOLS_MARKERS,
  VERSION_STAMP_PATTERN,
} from './markers.js';
export {
  COMPONENT_CONFIG_PREFIX,
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
export { SECTION_IDS, SECTION_ORDER, type SectionId } from './sections.js';
export { CORE_VERSION } from './version.js';
