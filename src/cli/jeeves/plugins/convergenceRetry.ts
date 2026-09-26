/**
 * Retry OpenClaw config writes while freshly installed plugins converge.
 *
 * @remarks
 * Right after `openclaw plugins install`, OpenClaw can refuse to edit a
 * plugin's retained config until that plugin's deferred data/settings
 * migration finishes. OpenClaw v2026.9.6 throws (from
 * `src/config/deferred-plugin-migration-config.ts`, message built by
 * `formatDeferredPluginMigration` in `src/infra/deferred-plugin-migrations.ts`):
 *
 * `Cannot edit retained config at "<path>". Plugin "<id>" data/settings upgrade is unfinished: <reason> ...`
 *
 * Only that signal is retried, with exponential backoff inside a fixed wait
 * budget; before each wait the optional `beforeRetry` hook runs (the plan
 * executor uses it to let OpenClaw clear pending migration records, see
 * `migrationSweep.ts`, since a refused `config set` never clears them); any other failure is rethrown at once. Config writes are idempotent
 * leaf sets/unsets, so repeating one is safe.
 *
 * @module
 */

import { CommandFailedError } from './commandRunner.js';

/** Backoff policy for {@link withConvergenceRetry}. */
export interface ConvergenceRetryPolicy {
  /** First delay (ms). */
  initialDelayMs: number;
  /** Largest single delay (ms). */
  maxDelayMs: number;
  /** Total time spent waiting across all retries (ms). */
  budgetMs: number;
}

/** Default policy: 2s, 4s, 8s, 16s, then 30s steps; 120s of waiting in total. */
export const DEFAULT_CONVERGENCE_RETRY: ConvergenceRetryPolicy = {
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
  budgetMs: 120_000,
};

/** Sleep port. */
export type Sleep = (ms: number) => Promise<void>;

/** Default sleep adapter (real timer). */
export const timerSleep: Sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const UNCONVERGED_PLUGIN =
  /Plugin "([^"]+)" data\/settings upgrade is unfinished/g;
const UNCONVERGED_ANY = /upgrade is unfinished|has not converged/i;

/**
 * Detect OpenClaw's "plugin not yet converged" refusal in a failure.
 *
 * @param error - The thrown value.
 * @returns The plugin ids still converging (`['unknown plugin']` when the
 *   signal is present without an id), or `undefined` when this is some other
 *   failure.
 */
export function unconvergedPlugins(error: unknown): string[] | undefined {
  if (!(error instanceof CommandFailedError)) return undefined;
  const text = `${error.result.stderr}\n${error.result.stdout}`;
  if (!UNCONVERGED_ANY.test(text)) return undefined;
  const ids = [
    ...new Set([...text.matchAll(UNCONVERGED_PLUGIN)].map((m) => m[1])),
  ];
  return ids.length > 0 ? ids : ['unknown plugin'];
}

/**
 * Delays for a policy: doubling from `initialDelayMs`, capped at
 * `maxDelayMs`, until the next delay would exceed the budget.
 *
 * @param policy - Retry policy.
 * @returns Delays in ms.
 */
export function retryDelays(policy: ConvergenceRetryPolicy): number[] {
  const delays: number[] = [];
  let total = 0;
  let next = policy.initialDelayMs;
  while (next > 0 && total + next <= policy.budgetMs) {
    delays.push(next);
    total += next;
    next = Math.min(next * 2, policy.maxDelayMs);
  }
  return delays;
}

/** Options for {@link withConvergenceRetry}. */
export interface ConvergenceRetryOptions {
  /** Sleep port. */
  sleep: Sleep;
  /** Line logger. */
  log: (line: string) => void;
  /** Backoff policy (default {@link DEFAULT_CONVERGENCE_RETRY}). */
  policy?: ConvergenceRetryPolicy;
  /** Runs after each refusal, before the wait (not after the last one). */
  beforeRetry?: () => Promise<void>;
}

/**
 * Run an idempotent OpenClaw config write, retrying only while plugins are
 * still converging.
 *
 * @param action - The write.
 * @param options - Sleep, logger, policy, pre-retry hook.
 * @throws The original error for any other failure; an `Error` naming the
 *   plugins still converging once the budget is spent.
 */
export async function withConvergenceRetry(
  action: () => Promise<void>,
  options: ConvergenceRetryOptions,
): Promise<void> {
  const delays = retryDelays(options.policy ?? DEFAULT_CONVERGENCE_RETRY);
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      await action();
      return;
    } catch (error) {
      const plugins = unconvergedPlugins(error);
      if (!plugins) throw error;
      const delay = delays.at(attempt);
      if (delay === undefined) {
        throw new Error(
          `OpenClaw still refuses the config write after ${String(waited / 1000)}s: plugin(s) ${plugins.join(', ')} have not finished converging after install. Wait, then rerun the command (or run "openclaw doctor --fix").`,
          { cause: error },
        );
      }
      options.log(
        `OpenClaw has not finished converging plugin(s) ${plugins.join(', ')}; retrying in ${String(delay / 1000)}s (retry ${String(attempt + 1)}/${String(delays.length)})`,
      );
      await options.beforeRetry?.();
      await options.sleep(delay);
      waited += delay;
    }
  }
}
