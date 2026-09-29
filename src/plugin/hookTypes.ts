/**
 * Structural types for OpenClaw's `before_prompt_build` hook and plugin
 * lifecycle API (subset, OpenClaw v2026.9.6).
 *
 * @remarks
 * `PromptBuildResult` deliberately omits `systemPrompt`: in OpenClaw it
 * REPLACES the entire system prompt (first value wins). Jeeves plugins must
 * only append, via `appendSystemContext` (runbook D5).
 *
 * @module
 */

/** Event passed to `before_prompt_build` handlers (subset). */
export interface PromptBuildEvent {
  /** Current prompt text. */
  prompt: string;
  /** Session messages prepared for this run. */
  messages: unknown[];
}

/** Agent context passed to hook handlers (subset). */
export interface PromptBuildContext {
  /** Agent id. */
  agentId?: string;
  /** Session key. */
  sessionKey?: string;
  /** Workspace directory for this run. */
  workspaceDir?: string;
  /** Channel/plugin id for channel-originated runs. */
  channel?: string;
  /** What triggered this turn (e.g. `user`, `heartbeat`, `cron`). */
  trigger?: string;
}

/**
 * Result a Jeeves `before_prompt_build` handler may return.
 *
 * @remarks
 * `appendSystemContext` is appended after the prompt-cache boundary in an
 * "OpenClaw plugin-injected system context" block; text from several plugins
 * is concatenated in priority order and does not count toward
 * `bootstrapMaxChars`.
 */
export interface PromptBuildResult {
  /** Text appended to the agent system prompt. */
  appendSystemContext?: string;
}

/** A `before_prompt_build` handler. */
export type PromptBuildHandler = (
  event: PromptBuildEvent,
  ctx: PromptBuildContext,
) => Promise<PromptBuildResult | undefined> | PromptBuildResult | undefined;

/** Hook registration options (subset). */
export interface HookRegistrationOptions {
  /** Ordering among handlers; higher runs first. */
  priority?: number;
  /** Stable id for this registration. */
  registrationId?: string;
  /** Per-handler timeout in ms (OpenClaw default for this hook: 15 000). */
  timeoutMs?: number;
}

/** Plugin-owned lifecycle API (subset of `api.lifecycle`). */
export interface PluginLifecycleApi {
  /** Aborted when the plugin instance is retired. */
  readonly signal?: AbortSignal;
  /**
   * Register a disposer run when the plugin instance is retired.
   *
   * @returns A function that unregisters the disposer.
   */
  onDispose?: (dispose: () => void | Promise<void>) => () => void;
  /** Register named cleanup for plugin-owned background work. */
  registerRuntimeLifecycle?: (registration: {
    /** Registration id. */
    id: string;
    /** Human-readable description. */
    description?: string;
    /** Release resources. */
    dispose?: () => void | Promise<void>;
  }) => void;
}
