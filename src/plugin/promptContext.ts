/**
 * Register always-in-context plugin rules via OpenClaw's `before_prompt_build`
 * hook, returning `{ appendSystemContext }` (never `systemPrompt`).
 *
 * @remarks
 * Runbook D5 / spike S2: `appendSystemContext` is appended after the prompt
 * cache boundary, concatenated across plugins in priority order, and does not
 * count toward `bootstrapMaxChars`. `systemPrompt` would replace the whole
 * prompt, so the result type here cannot express it.
 *
 * **Host config gate:** OpenClaw only runs this hook for non-bundled plugins
 * when `plugins.entries.<id>.hooks.allowConversationAccess` is `true`.
 * `openclaw plugins install --accept-capabilities` does NOT set it;
 * `jeeves install` / `jeeves update` grant it to plugins that declare the
 * hook in `package.json` `jeeves.conversationHooks`.
 *
 * @module
 */

import { z } from 'zod';

import { getErrorMessage } from '../utils.js';
import type { PromptBuildContext, PromptBuildResult } from './hookTypes.js';
import type { PluginApi } from './types.js';

/** Produces prompt context text; empty/undefined means "inject nothing". */
export type PromptContextProvider = (
  ctx: PromptBuildContext,
) => string | undefined | Promise<string | undefined>;

/** Zod schema for {@link registerPromptContext} options. */
export const promptContextOptionsSchema = z.object({
  /** Static text, or a (sync or async) provider evaluated per prompt build. */
  content: z.union([
    z.string(),
    z.custom<PromptContextProvider>((v) => typeof v === 'function', {
      message: 'content must be a string or a function',
    }),
  ]),
  /** Hook priority (higher runs first; controls concatenation order). */
  priority: z.number().int().optional(),
  /** Stable registration id. */
  registrationId: z.string().min(1).optional(),
  /** Per-handler timeout in ms. */
  timeoutMs: z.number().int().positive().optional(),
});

/** Options for {@link registerPromptContext}. */
export type PromptContextOptions = z.infer<typeof promptContextOptionsSchema>;

/**
 * Build the `before_prompt_build` result for a piece of text.
 *
 * @param text - Candidate context text.
 * @returns `{ appendSystemContext }`, or `undefined` when blank.
 */
function toResult(text: string | undefined): PromptBuildResult | undefined {
  const trimmed = text?.trim();
  return trimmed ? { appendSystemContext: trimmed } : undefined;
}

/**
 * Register plugin rules that must always be in the agent's context.
 *
 * @remarks
 * Provider errors are logged (via `api.logger` when present) and yield no
 * injection for that turn; they never fail the prompt build. Registers no
 * timers or process handlers.
 *
 * @example
 * ```typescript
 * export default function register(api: PluginApi): void {
 *   registerPromptContext(api, { content: WATCHER_RULES, priority: 10 });
 * }
 * ```
 *
 * @param api - The OpenClaw plugin API passed to `register(api)`.
 * @param options - Content and registration options.
 * @returns `true` if registered; `false` if the host has no `api.on`.
 * @throws ZodError if options are invalid.
 */
export function registerPromptContext(
  api: PluginApi,
  options: PromptContextOptions,
): boolean {
  const { content, priority, registrationId, timeoutMs } =
    promptContextOptionsSchema.parse(options);

  if (typeof api.on !== 'function') {
    api.logger?.warn(
      '[jeeves] host does not support api.on; prompt context not registered',
    );
    return false;
  }

  const handler =
    typeof content === 'string'
      ? () => toResult(content)
      : async (_event: unknown, ctx: PromptBuildContext) => {
          try {
            return toResult(await content(ctx));
          } catch (err: unknown) {
            api.logger?.warn(
              `[jeeves] prompt context provider failed: ${getErrorMessage(err)}`,
            );
            return undefined;
          }
        };

  api.on('before_prompt_build', handler, {
    priority,
    registrationId,
    timeoutMs,
  });
  return true;
}
