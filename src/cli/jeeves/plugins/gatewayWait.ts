/**
 * Wait for a running OpenClaw gateway to answer RPC, with bounded backoff.
 *
 * @remarks
 * OpenClaw v2026.9.6 re-captures every non-bundled plugin synchronously on
 * each config hot reload, stalling the gateway's event loop for tens of
 * seconds; a CLI call that needs the gateway meanwhile can lose its
 * WebSocket (close code 1006). Upstream bug:
 * https://github.com/openclaw/openclaw/issues/159698 (remove these waits once it is
 * fixed in the minimum supported OpenClaw). The probe is
 * `openclaw gateway status --require-rpc` (see {@link gatewayProbeArgs}).
 * Time is read from a clock port and waits go through a sleep port, so the
 * policy is testable without real time.
 *
 * @module
 */

import { getErrorMessage } from '../../../utils.js';
import { describeExit } from './commandLine.js';
import type { CommandResult, CommandRunner } from './commandRunner.js';
import type { Sleep } from './convergenceRetry.js';
import { gatewayProbeArgs, OPENCLAW_BIN } from './openclawCommands.js';

/** Backoff policy of a gateway wait. */
export interface GatewayWaitPolicy {
  /** First delay between attempts (ms). */
  initialDelayMs: number;
  /** Largest delay between attempts (ms). */
  maxDelayMs: number;
  /** Total time allowed for one wait, attempts included (ms). */
  budgetMs: number;
  /** Pause after a config write before the first probe, so its reload starts (ms). */
  reloadGraceMs: number;
}

/** Default policy: 2s doubling to 15s steps, 3 minutes in total, 3s grace. */
export const DEFAULT_GATEWAY_WAIT: GatewayWaitPolicy = {
  initialDelayMs: 2_000,
  maxDelayMs: 15_000,
  budgetMs: 180_000,
  reloadGraceMs: 3_000,
};

/** Ports of a gateway wait. */
export interface GatewayWaitPorts {
  /** Command runner. */
  runner: CommandRunner;
  /** Sleep port. */
  sleep: Sleep;
  /** Clock port (ms since epoch). */
  clock: () => number;
  /** Line logger. */
  log: (line: string) => void;
  /** Backoff policy. */
  policy: GatewayWaitPolicy;
}

/** One attempt: done with a value, or not yet with what was observed. */
export type Attempt<T> =
  { done: true; value: T } | { done: false; observed: string };

/** Outcome of {@link pollUntil}. */
export type PollOutcome<T> =
  { ok: true; value: T } | { ok: false; observed: string };

/**
 * Last non-empty output line of a result, for diagnostics.
 *
 * @param result - Command result.
 * @returns The line, or an empty string.
 */
export function lastOutputLine(result: CommandResult): string {
  const lines = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.at(-1) ?? '';
}

/**
 * Describe a failed read-only command: exit code plus its last output line.
 *
 * @param args - `openclaw` argument vector.
 * @param result - Command result.
 * @returns Description.
 */
export function describeFailure(
  args: readonly string[],
  result: CommandResult,
): string {
  const line = lastOutputLine(result);
  return `${describeExit(OPENCLAW_BIN, args, result.exitCode)}${line ? ` (${line})` : ''}`;
}

/**
 * Probe the gateway once.
 *
 * @param runner - Command runner.
 * @returns `undefined` when it answered, else what was observed.
 */
export async function probeGateway(
  runner: CommandRunner,
): Promise<string | undefined> {
  const args = gatewayProbeArgs();
  try {
    const result = await runner(OPENCLAW_BIN, args);
    return result.exitCode === 0 ? undefined : describeFailure(args, result);
  } catch (error) {
    return getErrorMessage(error);
  }
}

/**
 * Repeat an attempt with backoff until it is done or the deadline passes.
 *
 * @param ports - Sleep, clock, policy.
 * @param deadline - Clock value after which no further attempt starts.
 * @param attempt - The attempt.
 * @param onWait - Called with the observation before each wait.
 * @returns The value, or the last observation once the deadline passed.
 */
export async function pollUntil<T>(
  ports: Pick<GatewayWaitPorts, 'sleep' | 'clock' | 'policy'>,
  deadline: number,
  attempt: () => Promise<Attempt<T>>,
  onWait?: (observed: string, attemptNo: number) => void,
): Promise<PollOutcome<T>> {
  let delay = ports.policy.initialDelayMs;
  for (let n = 1; ; n++) {
    const result = await attempt();
    if (result.done) return { ok: true, value: result.value };
    const remaining = deadline - ports.clock();
    if (remaining <= 0) return { ok: false, observed: result.observed };
    onWait?.(result.observed, n);
    await ports.sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, ports.policy.maxDelayMs);
  }
}

/**
 * Wait until the gateway answers the probe.
 *
 * @param ports - Wait ports.
 * @param deadline - Clock value after which no further probe starts.
 * @param onWait - Called with the observation before each wait.
 * @returns `ok` once it answered, else the last observation.
 */
export function waitForGateway(
  ports: GatewayWaitPorts,
  deadline: number,
  onWait?: (observed: string, attemptNo: number) => void,
): Promise<PollOutcome<undefined>> {
  return pollUntil(
    ports,
    deadline,
    async () => {
      const observed = await probeGateway(ports.runner);
      return observed === undefined
        ? { done: true, value: undefined }
        : { done: false, observed };
    },
    onWait,
  );
}
