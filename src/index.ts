/**
 * `@karmaniverous/jeeves` — Shared library and CLI for the Jeeves platform.
 *
 * @remarks
 * Provides managed content writing, service discovery, config resolution,
 * and the `JeevesComponent` / `ComponentWriter` integration point for
 * Jeeves platform component plugins.
 *
 * @packageDocumentation
 */

export {
  ComponentWriter,
  createComponentWriter,
  type CreateComponentWriterOptions,
  type JeevesComponent,
  type PluginCommands,
  type ServiceCommands,
  type ServiceStatus,
} from './component/index.js';
export {
  AGENTS_MARKERS,
  CLEANUP_FLAG,
  COMPONENT_CONFIG_PREFIX,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
  CORE_VERSION,
  DEFAULT_PORTS,
  META_PORT,
  REGISTRY_CACHE_FILE,
  RUNNER_PORT,
  SECTION_IDS,
  SECTION_ORDER,
  type SectionId,
  SERVER_PORT,
  SOUL_MARKERS,
  STALENESS_THRESHOLD_MS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
  VERSION_STAMP_PATTERN,
  WATCHER_PORT,
  WORKSPACE_FILES,
} from './constants/index.js';
export {
  checkRegistryVersion,
  type CoreConfig,
  coreConfigSchema,
  generateJsonSchema,
  getServiceUrl,
  probeAllServices,
  type ProbeResult,
  probeService,
} from './discovery/index.js';
export {
  getComponentConfigDir,
  getConfigRoot,
  getCoreConfigDir,
  getCoreConfigFile,
  getWorkspacePath,
  init,
  type InitOptions,
  resetInit,
} from './init.js';
export {
  formatBeginMarker,
  formatEndMarker,
  jaccard,
  type ManagedSection,
  needsCleanup,
  parseManaged,
  type ParseManagedResult,
  shingles,
  shouldWrite,
  updateManagedSection,
  type UpdateManagedSectionOptions,
  type VersionStamp,
} from './managed/index.js';
export {
  refreshPlatformContent,
  type RefreshPlatformContentOptions,
  seedContent,
  type SeedContentOptions,
} from './platform/index.js';
