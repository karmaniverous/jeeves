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
 * never removed. Plugins check their declaration at build time with
 * `validateConversationHooks` (`src/plugin/conversationHooks.ts`).
 *
 * @module
 */

import {
  conversationHooksOf,
  declaredConversationHooksSchema,
} from '../../../plugin/conversationHooks.js';
import { parseJson } from '../../../utils.js';
import { type CommandRunner, runChecked } from './commandRunner.js';
import { NPM_BIN, npmViewFieldArgs } from './openclawCommands.js';

/** package.json field in which a plugin declares its conversation hooks. */
export const CONVERSATION_HOOKS_FIELD = 'jeeves.conversationHooks';

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
  const parsed = declaredConversationHooksSchema.safeParse(
    parseJson(
      text,
      `Unexpected output for ${packageName}@${version} ${CONVERSATION_HOOKS_FIELD}`,
    ),
  );
  if (!parsed.success) {
    throw new Error(
      `${packageName}@${version}: package.json ${CONVERSATION_HOOKS_FIELD} must be an array of hook names.`,
    );
  }
  return conversationHooksOf(parsed.data);
}
