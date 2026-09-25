/**
 * OpenClaw plugin SDK — types, tool helpers, prompt-context hook, lifecycle,
 * and configuration utilities.
 *
 * @packageDocumentation
 */

export {
  CONVERSATION_HOOK_NAMES,
  recordRegisteredHooks,
  validateConversationHooks,
} from './conversationHooks.js';
export { createPluginToolset } from './createPluginToolset.js';
export { getPackageRoot } from './getPackageRoot.js';
export { getPackageVersion } from './getPackageVersion.js';
export type {
  HookRegistrationOptions,
  PluginLifecycleApi,
  PromptBuildContext,
  PromptBuildEvent,
  PromptBuildHandler,
  PromptBuildResult,
} from './hookTypes.js';
export { fetchJson, fetchWithTimeout, postJson } from './http.js';
export { onPluginDispose } from './lifecycle.js';
export {
  type PromptContextOptions,
  promptContextOptionsSchema,
  type PromptContextProvider,
  registerPromptContext,
} from './promptContext.js';
export {
  resolveOptionalPluginSetting,
  resolvePluginSetting,
  resolveWorkspacePath,
} from './resolve.js';
export { connectionFail, fail, ok } from './results.js';
export {
  type SkillFrontmatter,
  validateSkillFrontmatter,
} from './skillFrontmatter.js';
export type {
  PluginApi,
  ToolDescriptor,
  ToolRegistrationOptions,
  ToolResult,
} from './types.js';
