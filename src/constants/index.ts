/**
 * Platform constants — ports, component registry, paths, and markers.
 *
 * @packageDocumentation
 */

export { PLATFORM_COMPONENTS, type PlatformComponent } from './components.js';
export {
  AGENTS_MARKERS,
  LEGACY_TOOLS_MARKERS,
  type ManagedMarkers,
  SOUL_MARKERS,
  VERSION_STAMP_PATTERN,
} from './markers.js';
export {
  COMPONENT_CONFIG_PREFIX,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
  SKILLS_DIR,
  WORKSPACE_FILES,
} from './paths.js';
export {
  DEFAULT_PORTS,
  META_PORT,
  RUNNER_PORT,
  SERVER_PORT,
  WATCHER_PORT,
} from './ports.js';
export { CORE_VERSION } from './version.js';
