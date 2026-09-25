/**
 * Which Jeeves plugins need `plugins.entries.<id>.hooks.allowConversationAccess`.
 *
 * @remarks
 * OpenClaw blocks every conversation hook of a non-bundled plugin unless its
 * entry has `hooks.allowConversationAccess: true`
 * (v2026.9.6 `src/plugins/registry-registrars-tools-hooks.ts`,
 * `hook-policy-decisions.ts`). OpenClaw exposes no static declaration of the
 * typed hooks a plugin registers: the manifest `hooks` field lists legacy
 * hook directories, and `plugins inspect --runtime` has to execute plugin
 * code and omits exactly the hooks that are blocked for lack of the grant.
 *
 * So the plugin package declares them in its own `package.json`:
 *
 * ```json
 * { "jeeves": { "conversationHooks": ["before_prompt_build"] } }
 * ```
 *
 * The CLI reads the field for the exact version it is about to install with
 * `npm view <pkg>@<version> jeeves.conversationHooks --json` (read-only, works
 * under `--dry-run` and before the package is on disk) and grants access only
 * when it names at least one of OpenClaw's conversation hooks. A missing field
 * means "none". A malformed field fails the command. An existing grant is
 * never removed.
 *
 * @module
 */

import { z } from 'zod';

import { type CommandRunner, runChecked } from './commandRunner.js';
import { NPM_BIN, npmViewFieldArgs } from './openclawCommands.js';

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

/** package.json field in which a plugin declares its conversation hooks. */
export const CONVERSATION_HOOKS_FIELD = 'jeeves.conversationHooks';

/** Schema of the declared field. */
export const declaredConversationHooksSchema = z.array(z.string().min(1));

/**
 * Conversation hooks among a plugin's declared hooks.
 *
 * @param declared - Declared hook names.
 * @returns The names OpenClaw gates behind `allowConversationAccess`.
 */
export function conversationHooksOf(declared: readonly string[]): string[] {
  return declared.filter((name) => CONVERSATION_HOOK_NAMES.includes(name));
}

/**
 * Read the conversation hooks a published plugin version declares.
 *
 * @param runner - Command runner.
 * @param packageName - Scoped npm package name.
 * @param version - Exact version.
 * @returns Declared conversation hooks (empty when the field is absent).
 * @throws Error when the field is present but malformed.
 */
export async function readDeclaredConversationHooks(
  runner: CommandRunner,
  packageName: string,
  version: string,
): Promise<string[]> {
  const { stdout } = await runChecked(
    runner,
    NPM_BIN,
    npmViewFieldArgs(packageName, version, CONVERSATION_HOOKS_FIELD),
  );
  const text = stdout.trim();
  if (!text) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Unexpected output for ${packageName}@${version} ${CONVERSATION_HOOKS_FIELD}`,
      { cause: error },
    );
  }
  const parsed = declaredConversationHooksSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${packageName}@${version}: package.json ${CONVERSATION_HOOKS_FIELD} must be an array of hook names.`,
    );
  }
  return conversationHooksOf(parsed.data);
}
