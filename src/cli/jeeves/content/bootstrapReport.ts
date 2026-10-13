/**
 * Bootstrap-file size report (#120): after `jeeves install` writes its
 * managed blocks, report each workspace bootstrap file's size against
 * OpenClaw's truncation limits, split into the Jeeves managed zone and the
 * owner's zone, and warn before OpenClaw silently truncates the end of a
 * file.
 *
 * @remarks
 * OpenClaw truncates each bootstrap file at `agents.defaults.bootstrapMaxChars`
 * (default 20,000) and the whole injected set at
 * `agents.defaults.bootstrapTotalMaxChars` (default 60,000); `USER.md` has a
 * fixed 4,000 cap that config can only lower. A file at or above
 * {@link WARN_RATIO} of its limit is a warning; above the limit it is
 * reported as truncated. Limits come from `openclaw config get`; when that
 * fails or the key is unset, the defaults apply and the report says so.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AGENTS_MARKERS,
  type ManagedMarkers,
  SOUL_MARKERS,
} from '../../../constants/index.js';
import { parseManaged } from '../../../managed/index.js';
import type { CommandRunner } from '../plugins/commandRunner.js';
import { configGetArgs, OPENCLAW_BIN } from '../plugins/openclawCommands.js';
import { BOOTSTRAP_FILE_MAX_CHARS } from './budgets.js';

/** OpenClaw's default total bootstrap cap (`bootstrapTotalMaxChars`). */
export const BOOTSTRAP_TOTAL_MAX_CHARS = 60_000;

/** OpenClaw's fixed `USER.md` cap. */
export const USER_FILE_MAX_CHARS = 4_000;

/** Fraction of a limit at which a file is reported as a warning. */
export const WARN_RATIO = 0.9;

/** Workspace bootstrap files OpenClaw injects, with their managed markers. */
const BOOTSTRAP_FILES: ReadonlyArray<{
  name: string;
  markers?: ManagedMarkers;
}> = [
  { name: 'AGENTS.md', markers: AGENTS_MARKERS },
  { name: 'SOUL.md', markers: SOUL_MARKERS },
  { name: 'IDENTITY.md' },
  { name: 'USER.md' },
  { name: 'BOOTSTRAP.md' },
  { name: 'MEMORY.md' },
];

/** Limits in effect, and where they came from. */
export interface BootstrapLimits {
  /** Per-file limit. */
  perFile: number;
  /** Total limit across all injected files. */
  total: number;
  /** Whether either value fell back to OpenClaw's default. */
  defaulted: boolean;
}

/** Severity of one measurement. */
export type BootstrapLevel = 'ok' | 'warn' | 'over';

/** One file's measurement. */
export interface BootstrapFileSize {
  /** File name (relative to the workspace). */
  name: string;
  /** Whole-file characters. */
  chars: number;
  /** Characters inside the Jeeves managed block (markers included). */
  managedChars: number;
  /** Characters outside it (the owner's zone). */
  userChars: number;
  /** Limit that applies to this file. */
  limit: number;
  /** Severity. */
  level: BootstrapLevel;
}

/** The whole report. */
export interface BootstrapReport {
  /** Present files, in injection order. */
  files: BootstrapFileSize[];
  /** Sum of all present files. */
  totalChars: number;
  /** Severity of the total. */
  totalLevel: BootstrapLevel;
  /** Limits used. */
  limits: BootstrapLimits;
}

/** Severity of `chars` against `limit`. */
export const levelOf = (chars: number, limit: number): BootstrapLevel =>
  chars > limit ? 'over' : chars >= limit * WARN_RATIO ? 'warn' : 'ok';

/** Characters of the managed block in `content` (markers included), or 0. */
function managedSize(content: string, markers: ManagedMarkers): number {
  const parsed = parseManaged(content, markers);
  if (!parsed.found) return 0;
  const begin = content.indexOf(`<!-- ${markers.begin}`);
  const endTag = `<!-- ${markers.end} -->`;
  const end = content.indexOf(endTag, begin);
  return begin < 0 || end < 0 ? 0 : end + endTag.length - begin;
}

/**
 * Measure the workspace bootstrap files.
 *
 * @param workspacePath - Workspace root.
 * @param limits - Limits in effect.
 * @returns The report (absent files are skipped).
 */
export function measureBootstrapFiles(
  workspacePath: string,
  limits: BootstrapLimits,
): BootstrapReport {
  const files: BootstrapFileSize[] = [];
  for (const { name, markers } of BOOTSTRAP_FILES) {
    const path = join(workspacePath, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const chars = content.length;
    const managedChars = markers ? managedSize(content, markers) : 0;
    const limit =
      name === 'USER.md'
        ? Math.min(USER_FILE_MAX_CHARS, limits.perFile)
        : limits.perFile;
    files.push({
      name,
      chars,
      managedChars,
      userChars: chars - managedChars,
      limit,
      level: levelOf(chars, limit),
    });
  }
  const totalChars = files.reduce((sum, f) => sum + f.chars, 0);
  return {
    files,
    totalChars,
    totalLevel: levelOf(totalChars, limits.total),
    limits,
  };
}

/**
 * OpenClaw's default limits, marked as defaulted (used without reading
 * config, e.g. for `--content-only`, which must not touch OpenClaw).
 */
export const DEFAULT_BOOTSTRAP_LIMITS: BootstrapLimits = {
  perFile: BOOTSTRAP_FILE_MAX_CHARS,
  total: BOOTSTRAP_TOTAL_MAX_CHARS,
  defaulted: true,
};

/** Read one positive integer config value, or `undefined`. */
async function readLimit(
  runner: CommandRunner,
  path: string,
): Promise<number | undefined> {
  try {
    const result = await runner(OPENCLAW_BIN, configGetArgs(path));
    if (result.exitCode !== 0) return undefined;
    const value: unknown = JSON.parse(result.stdout);
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read OpenClaw's bootstrap limits, falling back to the defaults.
 *
 * @param runner - Command runner.
 * @returns The limits and whether a default was used.
 */
export async function readBootstrapLimits(
  runner: CommandRunner,
): Promise<BootstrapLimits> {
  const perFile = await readLimit(runner, 'agents.defaults.bootstrapMaxChars');
  const total = await readLimit(
    runner,
    'agents.defaults.bootstrapTotalMaxChars',
  );
  return {
    perFile: perFile ?? BOOTSTRAP_FILE_MAX_CHARS,
    total: total ?? BOOTSTRAP_TOTAL_MAX_CHARS,
    defaulted: perFile === undefined || total === undefined,
  };
}

/** Marker for a level. */
const mark = (level: BootstrapLevel): string =>
  level === 'over'
    ? 'OVER LIMIT, truncated by OpenClaw'
    : level === 'warn'
      ? 'WARNING, near limit'
      : 'ok';

/** Percentage of `limit`. */
const pct = (chars: number, limit: number): string =>
  `${String(Math.round((chars / limit) * 100))}%`;

/**
 * Render the report.
 *
 * @param report - The report.
 * @returns Lines to print.
 */
export function bootstrapReportLines(report: BootstrapReport): string[] {
  const lines = ['Bootstrap files (OpenClaw truncates past these limits)'];
  for (const f of report.files) {
    const split =
      f.managedChars > 0
        ? ` (Jeeves ${String(f.managedChars)}, yours ${String(f.userChars)})`
        : '';
    lines.push(
      `  ${f.name}: ${String(f.chars)} / ${String(f.limit)} (${pct(f.chars, f.limit)})${split}: ${mark(f.level)}`,
    );
  }
  lines.push(
    `  total: ${String(report.totalChars)} / ${String(report.limits.total)} (${pct(report.totalChars, report.limits.total)}): ${mark(report.totalLevel)}`,
  );
  if (report.limits.defaulted) {
    lines.push(
      "  (could not read OpenClaw's bootstrap limits; using the defaults)",
    );
  }
  return lines;
}

/**
 * Whether the report has any warning or over-limit entry.
 *
 * @param report - The report.
 * @returns `true` when `--strict` should fail.
 */
export const hasBootstrapProblems = (report: BootstrapReport): boolean =>
  report.totalLevel !== 'ok' || report.files.some((f) => f.level !== 'ok');
