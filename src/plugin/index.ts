/**
 * OpenClaw plugin SDK — types, helpers, and configuration utilities.
 *
 * @packageDocumentation
 */

export { createPluginToolset } from './createPluginToolset.js';
export { getPackageVersion } from './getPackageVersion.js';
export { fetchJson, fetchWithTimeout, postJson } from './http.js';
export {
  patchConfig,
  resolveConfigPath,
  resolveOpenClawHome,
} from './openclawConfig.js';
export {
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  resolveWorkspacePath,
} from './resolve.js';
export { connectionFail, fail, ok } from './results.js';
export type {
  PluginApi,
  ToolDescriptor,
  ToolRegistrationOptions,
  ToolResult,
} from './types.js';
