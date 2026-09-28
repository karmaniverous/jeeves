/**
 * Whether OpenClaw applied a run's plugin changes live.
 *
 * @remarks
 * OpenClaw says so in the output of each mutating command: `plugins install`
 * prints `Applied in Gateway generation <n>.` and `config set` prints
 * `Change will apply without restarting the gateway.` A change without such
 * a line (no gateway, an older OpenClaw, an install recovered after a lost
 * gateway connection) counts as needing a gateway restart (#118).
 *
 * @module
 */

/** Tally of the mutating OpenClaw commands of one plan run. */
export interface ApplyReport {
  /** Mutating commands run. */
  changes: number;
  /** Of those, how many OpenClaw reported as applied live. */
  live: number;
  /** Gateway generations reported by `Applied in Gateway generation <n>`. */
  generations: number[];
}

/**
 * An empty report (nothing changed).
 *
 * @returns A new report.
 */
export const emptyApplyReport = (): ApplyReport => ({
  changes: 0,
  live: 0,
  generations: [],
});

const GENERATION = /Applied in Gateway generation (\d+)/i;
const WITHOUT_RESTART = /apply without restarting/i;

/**
 * Record one mutating command.
 *
 * @param report - Report (updated).
 * @param output - The command's stdout and stderr, or `undefined` when the
 *   outcome is unknown (counts as not applied live).
 */
export function recordChange(
  report: ApplyReport,
  output: string | undefined,
): void {
  report.changes++;
  if (output === undefined) return;
  const generation = GENERATION.exec(output)?.[1];
  if (generation !== undefined) report.generations.push(Number(generation));
  if (generation !== undefined || WITHOUT_RESTART.test(output)) report.live++;
}

/**
 * Whether every change was applied live (and at least one was made).
 *
 * @param report - Report.
 * @returns `true` when no gateway restart is needed.
 */
export const allAppliedLive = (report: ApplyReport): boolean =>
  report.changes > 0 && report.live === report.changes;
