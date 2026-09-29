/**
 * Build/test-time check that a plugin's `package.json` declares the OpenClaw
 * conversation hooks it registers (e.g. via `registerPromptContext`), as
 * `"jeeves": { "conversationHooks": [...] }`. Pure apart from calling the
 * plugin's own `register` with a recording API.
 *
 * @remarks
 * OpenClaw blocks every conversation hook of a non-bundled plugin unless
 * `plugins.entries.<id>.hooks.allowConversationAccess` is `true`, and it has
 * no static record of the typed hooks a plugin registers. `jeeves install` /
 * `jeeves update` therefore grant access only to plugins whose `package.json`
 * declares such hooks. A plugin that registers one without declaring it
 * installs cleanly and then silently never runs the hook, so plugins should
 * run {@link validateConversationHooks} in a test or build step:
 *
 * ```typescript
 * const hooks = await recordRegisteredHooks(register);
 * validateConversationHooks(JSON.parse(readFileSync('package.json', 'utf-8')), hooks);
 * ```
 *
 * @module
 */

import { z } from 'zod';

import type { PluginApi } from './types.js';

/**
 * OpenClaw's conversation hooks: the typed hooks gated by
 * `allowConversationAccess` (v2026.9.6 `src/plugins/hook-types.ts`
 * `CONVERSATION_HOOK_NAMES`).
 */
export const CONVERSATION_HOOK_NAMES: readonly string[] = [
  'before_model_resolve',
  'agent_turn_prepare',
  'before_prompt_build',
  'before_agent_reply',
  'llm_input',
  'llm_output',
  'before_agent_finalize',
  'agent_end',
  'before_agent_run',
];

/** Schema of `package.json` `jeeves.conversationHooks`. */
export const declaredConversationHooksSchema = z.array(z.string().min(1));

const packageJsonSchema = z.looseObject({
  jeeves: z
    .looseObject({ conversationHooks: z.unknown().optional() })
    .optional(),
});

/**
 * Conversation hooks among some hook names (order kept, duplicates dropped).
 *
 * @param names - Hook names.
 * @returns The names OpenClaw gates behind `allowConversationAccess`.
 */
export function conversationHooksOf(names: readonly string[]): string[] {
  return [...new Set(names)].filter((n) => CONVERSATION_HOOK_NAMES.includes(n));
}

/**
 * Run a plugin's `register(api)` against a recording API and return the
 * typed hook names it registers with `api.on` (e.g. `before_prompt_build`
 * from `registerPromptContext`).
 *
 * @param register - The plugin's register function.
 * @param api - Extra API members the plugin needs at registration (config,
 *   logger, ...). `on` is always the recorder; `registerTool` defaults to a
 *   no-op.
 * @returns Registered hook names, in registration order.
 */
export async function recordRegisteredHooks(
  register: (api: PluginApi) => unknown,
  api: Partial<PluginApi> = {},
): Promise<string[]> {
  const hooks: string[] = [];
  await register({
    registerTool: () => undefined,
    ...api,
    on: (hookName: string) => {
      hooks.push(hookName);
    },
  });
  return hooks;
}

/**
 * Check that `package.json` declares exactly the conversation hooks a plugin
 * registers.
 *
 * @param packageJson - Parsed `package.json` of the plugin package.
 * @param registeredHooks - Hook names the plugin registers (see
 *   {@link recordRegisteredHooks}); non-conversation hooks are ignored.
 * @returns The declared conversation hooks.
 * @throws Error when the field is malformed, a registered conversation hook
 *   is not declared, or a declared hook is not a registered conversation hook.
 */
export function validateConversationHooks(
  packageJson: unknown,
  registeredHooks: readonly string[],
): string[] {
  const pkg = packageJsonSchema.safeParse(packageJson);
  if (!pkg.success) throw new Error('package.json must be a JSON object');
  const field = pkg.data.jeeves?.conversationHooks;
  const parsed = declaredConversationHooksSchema.safeParse(field ?? []);
  if (!parsed.success) {
    throw new Error(
      'package.json jeeves.conversationHooks must be an array of hook names',
    );
  }
  const declared = [...new Set(parsed.data)];
  const needed = conversationHooksOf(registeredHooks);
  const missing = needed.filter((h) => !declared.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `package.json must declare "jeeves": { "conversationHooks": ${JSON.stringify(needed)} }; missing: ${missing.join(', ')}. Without it jeeves install does not grant allowConversationAccess and OpenClaw never runs the hook.`,
    );
  }
  const extra = declared.filter((h) => !needed.includes(h));
  if (extra.length > 0) {
    throw new Error(
      `package.json jeeves.conversationHooks lists hooks the plugin does not register as conversation hooks: ${extra.join(', ')}. Remove them (they would grant conversation access for nothing).`,
    );
  }
  return declared;
}
