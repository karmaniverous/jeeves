/**
 * `@karmaniverous/jeeves` — Shared library and CLI for the Jeeves platform.
 *
 * @remarks
 * Provides service discovery, config resolution, the
 * `JeevesComponentDescriptor` schema, pure managed-block primitives, service
 * handlers, and OpenClaw plugin helpers (tool toolset, `before_prompt_build`
 * prompt context, conversation-hook checks, lifecycle disposal). The static
 * platform content is internal to the `jeeves` CLI and not exported.
 * Importing it registers no process handlers or timers.
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
  SOUL_MARKERS,
  VERSION_STAMP_PATTERN,
  WATCHER_PORT,
  WORKSPACE_FILES,
} from './constants/index.js';
export {
  computeInsiderKey,
  computeOutsiderKeyWithExpiry,
  computePathKey,
} from './crypto.js';
export {
  type CoreConfig,
  coreConfigSchema,
  DEFAULT_BIND_ADDRESS,
  generateJsonSchema,
  getBindAddress,
  getServiceState,
  getServiceUrl,
  type ServiceScope,
  type ServiceState,
  type ServiceStatus,
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
  type CatalogToolSelection,
  connectionFail,
  CONVERSATION_HOOK_NAMES,
  createPluginToolset,
  DEFAULT_FETCH_TIMEOUT_MS,
  fail,
  fetchJson,
  type FetchJsonOptions,
  fetchWithTimeout,
  getPackageRoot,
  getPackageVersion,
  type HookRegistrationOptions,
  ok,
  onPluginDispose,
  type PluginApi,
  type PluginApiUrlResolver,
  type PluginContext,
  type PluginLifecycleApi,
  type PluginToolsetOptions,
  pluginToolsetOptionsSchema,
  postJson,
  type PromptBuildContext,
  type PromptBuildEvent,
  type PromptBuildHandler,
  type PromptBuildResult,
  type PromptContextOptions,
  promptContextOptionsSchema,
  type PromptContextProvider,
  recordRegisteredHooks,
  registerPromptContext,
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  resolveWorkspacePath,
  type SkillFrontmatter,
  type ToolDescriptor,
  type ToolRegistrationOptions,
  type ToolResult,
  validateConversationHooks,
  validateSkillFrontmatter,
} from './plugin/index.js';
export {
  type AccountConfig,
  appendJsonl,
  argFlag,
  argOptional,
  type ArgSpec,
  argValue,
  type ArgValueOptions,
  createGoogleAuth,
  ensureDir,
  exponentialBackoff,
  type FlagSpec,
  type GoogleAuthOptions,
  loadEnvFile,
  nowIso,
  type OptionalSpec,
  type ParsedArgs,
  parseRunnableArgs,
  positionalArgs,
  readJson,
  readJsonl,
  retryAsync,
  type RetryOptions,
  type RetryPolicy,
  retrySync,
  run,
  type RunOptions,
  runScript,
  runWithRetry,
  saveCache,
  type ServiceAccountFileConfig,
  type SlackWorkspaceOptions,
  sleepAsync,
  sleepMs,
  unknownArgs,
  uuid,
  valuelessArgs,
  type ValueSpec,
  writeJsonAtomic,
  writeJsonl,
} from './scripts/index.js';
export {
  createServiceManager,
  type ServiceInstallResult,
  type ServiceManager,
  type ServiceManagerOptions,
} from './service/index.js';
export { getErrorMessage, isTransientError } from './utils.js';

// Deprecated (#127): `export *` keeps the re-export lint-clean.
export * from './scripts/deprecated.js';
