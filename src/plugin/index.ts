/**
 * OpenClaw plugin SDK — types, helpers, and configuration utilities.
 *
 * @packageDocumentation
 */

export { fetchJson, postJson } from './http.js';
export {
  patchConfig,
  resolveConfigPath,
  resolveOpenClawHome,
} from './openclawConfig.js';
export { resolvePluginSetting, resolveWorkspacePath } from './resolve.js';
export { connectionFail, fail, ok } from './results.js';
export type {
  PluginApi,
  PluginApiLike,
  ToolDescriptor,
  ToolRegistrationOptions,
  ToolResult,
} from './types.js';
