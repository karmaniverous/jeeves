/**
 * `@karmaniverous/jeeves` — Shared library and CLI for the Jeeves platform.
 *
 * @remarks
 * Provides the static platform content (SOUL/AGENTS managed sections,
 * platform skills, templates) as pure data and render functions, service
 * discovery, config resolution, the `JeevesComponentDescriptor` schema, and
 * OpenClaw plugin helpers (tool toolset, `before_prompt_build` prompt context,
 * lifecycle disposal). Importing it registers no process handlers or timers.
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
export { checkNodeVersion } from './cli/jeeves/checkNodeVersion.js';
export {
  type ResolvedCliConfig,
  type WorkspaceOptions,
} from './cli/jeeves/cliDefaults.js';
export { buildEffectiveConfig } from './cli/jeeves/configCommand.js';
export { createServiceCli } from './cli/service/index.js';
export {
  getEffectiveServiceName,
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
} from './component/index.js';
export {
  type ConfigProvenance,
  generateWorkspaceJsonSchema,
  loadWorkspaceConfig,
  resolveConfigValue,
  type ResolvedValue,
  substituteEnvVars,
  WORKSPACE_CONFIG_DEFAULTS,
  WORKSPACE_CONFIG_FILE,
  type WorkspaceConfig,
  workspaceConfigSchema,
} from './config/index.js';
export {
  AGENTS_MARKERS,
  COMPONENT_CONFIG_PREFIX,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
  CORE_VERSION,
  DEFAULT_PORTS,
  LEGACY_TOOLS_MARKERS,
  type ManagedMarkers,
  META_PORT,
  PLATFORM_COMPONENTS,
  type PlatformComponent,
  RUNNER_PORT,
  SERVER_PORT,
  SKILLS_DIR,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  VERSION_STAMP_PATTERN,
  WATCHER_PORT,
  WORKSPACE_FILES,
} from './constants/index.js';
export {
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
  getComponentConfigPath,
  getConfigRoot,
  getCoreConfigDir,
  getCoreConfigFile,
  getWorkspacePath,
  init,
  type InitOptions,
  registerComponentConfigPath,
  rejectWindowsDrivePath,
  resetInit,
} from './init.js';
export {
  atomicWrite,
  formatBeginMarker,
  formatEndMarker,
  type ManagedBlockStampOptions,
  parseManaged,
  type ParseManagedResult,
  removeManagedBlock,
  renderManagedBlock,
  STALE_LOCK_MS,
  upsertManagedBlock,
  type VersionStamp,
  withFileLock,
} from './managed/index.js';
export {
  analyzeMemory,
  type MemoryHygieneOptions,
  type MemoryHygieneResult,
} from './memory/index.js';
export {
  connectionFail,
  createPluginToolset,
  fail,
  fetchJson,
  fetchWithTimeout,
  getPackageRoot,
  getPackageVersion,
  type HookRegistrationOptions,
  ok,
  onPluginDispose,
  type PluginApi,
  type PluginLifecycleApi,
  postJson,
  type PromptBuildContext,
  type PromptBuildEvent,
  type PromptBuildHandler,
  type PromptBuildResult,
  type PromptContextOptions,
  promptContextOptionsSchema,
  type PromptContextProvider,
  registerPromptContext,
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  resolveWorkspacePath,
  type SkillFrontmatter,
  type ToolDescriptor,
  type ToolRegistrationOptions,
  type ToolResult,
  validateSkillFrontmatter,
} from './plugin/index.js';
export {
  type AccountConfig,
  appendJsonl,
  createGoogleAuth,
  ensureDir,
  getArg,
  getChannelWorkspace,
  type GoogleAuthOptions,
  loadEnvFile,
  nowIso,
  parseArgs,
  readJson,
  readJsonl,
  type RetryOptions,
  run,
  type RunOptions,
  runScript,
  runWithRetry,
  saveCache,
  type ServiceAccountFileConfig,
  type SlackWorkspaceOptions,
  sleepAsync,
  sleepMs,
  uuid,
  writeJsonAtomic,
  writeJsonl,
} from './scripts/index.js';
export {
  createServiceManager,
  type ServiceManager,
  type ServiceManagerOptions,
} from './service/index.js';
export { getErrorMessage, isTransientError } from './utils.js';
