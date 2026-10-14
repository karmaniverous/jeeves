/**
 * Filesystem side of the OpenClaw dist patches: locate candidate chunks in
 * the dist directory (both `.js` and `.mjs`, found by content rather than
 * by hashed chunk name) and apply or preview a patch plan.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/lib/dist-patch-io.ts`
 * (jeeves-core 0.7.0, #121), adapted to return a structured
 * {@link PatchOutcome} instead of a boolean so the CLI can fold results
 * into install/update reporting. Never restarts the gateway
 * (Decision 70): the caller is responsible for printing a restart notice
 * when a live run changes the dist.
 *
 * @module
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicWrite } from '../../../managed/index.js';
import { getErrorMessage } from '../../../utils.js';
import type { DistPatchPlan } from './textPatch.js';

/** A dist chunk whose content contains a given marker. */
export interface DistChunk {
  file: string;
  filePath: string;
  content: string;
}

/** List top-level `.js` / `.mjs` chunks in the dist directory. */
export function listDistChunks(distDir: string): string[] {
  return fs
    .readdirSync(distDir)
    .filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))
    .sort();
}

/** Read every chunk whose content includes `marker`. */
export function findChunks(distDir: string, marker: string): DistChunk[] {
  const out: DistChunk[] = [];
  for (const file of listDistChunks(distDir)) {
    const filePath = path.join(distDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(marker)) out.push({ file, filePath, content });
  }
  return out;
}

/**
 * Assert that a target dist file can be replaced before any patch attempts
 * to write it (Decision 70: fail up front, never retry with elevation).
 *
 * @remarks
 * `atomicWrite` writes a temp file beside the target and renames it over
 * the target, so both the file and its directory must be writable.
 *
 * @param filePath - Absolute path to the dist chunk about to be patched.
 * @throws When the file or its directory is not writable, naming the path
 *   and the current OS user.
 */
export function assertWritable(filePath: string): void {
  for (const target of [filePath, path.dirname(filePath)]) {
    try {
      fs.accessSync(target, fs.constants.W_OK);
    } catch {
      const what = target === filePath ? 'Dist file' : 'Dist directory';
      throw new Error(
        `${what} is not writable: ${target} (current user: ${os.userInfo().username}). ` +
          'Fix permissions and re-run; patch-openclaw never retries with elevation.',
      );
    }
  }
}

/** Line sinks for patch progress (default: the console). */
export interface PatchLogger {
  /** Progress and success lines. */
  log: (line: string) => void;
  /** Failure lines. */
  error: (line: string) => void;
}

/** {@link PatchLogger} writing to `console.log` / `console.error`. */
export const consolePatchLogger: PatchLogger = {
  log: (line) => {
    console.log(line);
  },
  error: (line) => {
    console.error(line);
  },
};

/** Outcome of running one dist patch. */
export interface PatchOutcome {
  /** Patch name, e.g. `tool-order`. */
  name: string;
  status:
    'patched' | 'already-patched' | 'upstream-fixed' | 'not-found' | 'error';
  /** Human-readable detail (file:line, or the failure reason). */
  message: string;
}

const indent = (s: string): string =>
  s
    .split('\n')
    .map((l) => `    | ${l}`)
    .join('\n');

/**
 * Report (and unless dry-run, write) a patch plan.
 *
 * @param name - Patch name for the returned outcome.
 * @param distDir - Dist directory the plan's file is relative to.
 * @param plan - Decision computed by {@link planAcrossFiles}.
 * @param dryRun - When true, nothing is written.
 * @param logger - Where progress lines go (default: the console).
 * @returns A structured {@link PatchOutcome}.
 */
export function applyDistPlan(
  name: string,
  distDir: string,
  plan: DistPatchPlan,
  dryRun: boolean,
  logger: PatchLogger = consolePatchLogger,
): PatchOutcome {
  const fail = (
    status: 'not-found' | 'error',
    message: string,
  ): PatchOutcome => {
    logger.error(`[${name}] FAILED — ${message}`);
    return { name, status, message };
  };

  if (plan.status !== 'found') return fail(plan.status, plan.message);

  const { file, result } = plan;
  const where = `${file}:${String(result.line)}`;

  if (result.status !== 'patch') {
    const message =
      result.status === 'already-patched'
        ? `already patched (${where})`
        : `upstream-fixed: OpenClaw no longer needs this patch (${where})`;
    logger.log(`[${name}] ${message}.`);
    return { name, status: result.status, message };
  }

  const filePath = path.join(distDir, file);
  logger.log(`[${name}] ${dryRun ? 'WOULD PATCH' : 'patching'} ${where}`);
  logger.log(`  before:\n${indent(result.before)}`);
  logger.log(`  after:\n${indent(result.after)}`);

  // Checked in dry runs too, so a dry run reports the failure a live run
  // would hit instead of "would patch".
  try {
    assertWritable(filePath);
  } catch (err) {
    return fail('error', getErrorMessage(err));
  }

  if (dryRun) {
    return {
      name,
      status: 'patched',
      message: `would patch ${where} (dry run)`,
    };
  }

  atomicWrite(filePath, result.content);
  logger.log(`[${name}] patched ${where}.`);
  return { name, status: 'patched', message: `patched ${where}` };
}
