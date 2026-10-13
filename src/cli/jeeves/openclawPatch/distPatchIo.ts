/**
 * Filesystem side of the OpenClaw dist patches: locate candidate chunks in
 * the dist directory (both `.js` and `.mjs`, found by content rather than
 * by hashed chunk name) and apply or preview a patch plan.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/lib/dist-patch-io.ts`
 * (jeeves-core 0.7.0 step 4, #121), adapted to return a structured
 * {@link PatchOutcome} instead of a boolean so the CLI can fold results
 * into install/update reporting (step 5). Never restarts the gateway
 * (Decision 70): the caller is responsible for printing a restart notice
 * when a live run changes the dist.
 *
 * @module
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { atomicWrite } from '../../../managed/index.js';
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
 * Assert that a target dist file is writable before any patch attempts to
 * write it (Decision 70: fail up front, never retry with elevation).
 *
 * @param filePath - Absolute path to the dist chunk about to be patched.
 * @throws When the file is not writable, naming the path and the current
 *   OS user.
 */
export function assertWritable(filePath: string): void {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
  } catch {
    throw new Error(
      `Dist file is not writable: ${filePath} (current user: ${os.userInfo().username}). ` +
        'Fix file permissions and re-run; patch-openclaw never retries with elevation.',
    );
  }
}

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
 * @returns A structured {@link PatchOutcome}.
 */
export function applyDistPlan(
  name: string,
  distDir: string,
  plan: DistPatchPlan,
  dryRun: boolean,
): PatchOutcome {
  if (plan.status === 'not-found') {
    console.error(`[${name}] FAILED — ${plan.message}`);
    return { name, status: 'not-found', message: plan.message };
  }

  if (plan.status === 'error') {
    console.error(`[${name}] FAILED — ${plan.message}`);
    return { name, status: 'error', message: plan.message };
  }

  if (plan.status === 'already-patched') {
    const message = `already patched (${plan.file}:${String(plan.result.line)})`;
    console.log(`[${name}] ${message}.`);
    return { name, status: 'already-patched', message };
  }

  const { file, result } = plan;
  const filePath = path.join(distDir, file);
  console.log(
    `[${name}] ${dryRun ? 'WOULD PATCH' : 'patching'} ${file}:${String(result.line)}`,
  );
  console.log(`  before:\n${indent(result.before)}`);
  console.log(`  after:\n${indent(result.after)}`);

  if (dryRun) {
    return {
      name,
      status: 'patched',
      message: `would patch ${file}:${String(result.line)} (dry run)`,
    };
  }

  try {
    assertWritable(filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${name}] FAILED — ${message}`);
    return { name, status: 'error', message };
  }

  atomicWrite(filePath, result.content);
  const message = `patched ${file}:${String(result.line)}`;
  console.log(`[${name}] ${message}.`);
  return { name, status: 'patched', message };
}
