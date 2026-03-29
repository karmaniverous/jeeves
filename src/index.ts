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
  type ConfigApplyHandler,
  type ConfigApplyRequest,
  type ConfigApplyResult,
  type ConfigQueryHandler,
  type ConfigQueryResponse,
  createConfigApplyHandler,
  createConfigQueryHandler,
  createStatusHandler,
  type CreateStatusHandlerOptions,
  type StatusHandler,
  type StatusHandlerResult,
  type StatusResponse,
} from './api/index.js';
export {
  createPluginCli,
  type CreatePluginCliOptions,
} from './cli/plugin/index.js';
export { createServiceCli } from './cli/service/index.js';
export {
  type AsyncContentCacheOptions,
  type ComponentDependencies,
  type ComponentState,
  type ComponentVersionEntry,
  type ComponentVersionsState,
  ComponentWriter,
  createAsyncContentCache,
  createComponentWriter,
  getEffectiveServiceName,
  isPrime,
  type JeevesComponent,
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
  orchestrateHeartbeat,
  type OrchestrateHeartbeatOptions,
  type PluginCommands,
  readComponentVersions,
  removeComponentVersion,
  type ServiceCommands,
  type ServiceStatus,
  writeComponentVersion,
  type WriteComponentVersionOptions,
} from './component/index.js';
export {
  AGENTS_MARKERS,
  CLEANUP_FLAG,
  COMPONENT_CONFIG_PREFIX,
  COMPONENT_VERSIONS_FILE,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
  CORE_VERSION,
  DEFAULT_PORTS,
  type ManagedMarkers,
  META_PORT,
  PLATFORM_COMPONENTS,
  type PlatformComponent,
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
  DEFAULT_BIND_ADDRESS,
  generateJsonSchema,
  getBindAddress,
  getServiceState,
  getServiceUrl,
  type ServiceState,
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
  atomicWrite,
  buildHeartbeatSection,
  DEFAULT_CORE_VERSION,
  formatBeginMarker,
  formatEndMarker,
  HEARTBEAT_HEADING,
  type HeartbeatEntry,
  jaccard,
  type ManagedSection,
  needsCleanup,
  type ParsedHeartbeat,
  parseHeartbeat,
  parseManaged,
  type ParseManagedResult,
  removeManagedSection,
  type RemoveManagedSectionOptions,
  shingles,
  shouldWrite,
  STALE_LOCK_MS,
  updateManagedSection,
  type UpdateManagedSectionOptions,
  type VersionStamp,
  withFileLock,
  writeHeartbeatSection,
} from './managed/index.js';
export {
  refreshPlatformContent,
  type RefreshPlatformContentOptions,
  seedContent,
  type SeedContentOptions,
} from './platform/index.js';
export {
  connectionFail,
  createPluginToolset,
  fail,
  fetchJson,
  fetchWithTimeout,
  ok,
  patchConfig,
  type PluginApi,
  postJson,
  resolveConfigPath,
  resolveOpenClawHome,
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  resolveWorkspacePath,
  type ToolDescriptor,
  type ToolRegistrationOptions,
  type ToolResult,
} from './plugin/index.js';
export {
  createServiceManager,
  type ServiceManager,
  type ServiceManagerOptions,
} from './service/index.js';
