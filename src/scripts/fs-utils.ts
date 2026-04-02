/**
 * Shared filesystem utilities for runner job scripts.
 *
 * @module
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ========== Time & UUID ==========

/** Return current time as ISO 8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Generate a random UUID v4. */
export function uuid(): string {
  return crypto.randomUUID();
}

// ========== File System ==========

/** Create a directory and any missing parents. */
export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

/** Read and parse a JSON file, returning `fallback` on any error. */
export function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Atomically write a JSON file (write to .tmp, then rename). */
export function writeJsonAtomic(p: string, obj: unknown): void {
  ensureDir(path.dirname(p));
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

/** Append a single JSON object as a JSONL line. */
export function appendJsonl(p: string, obj: unknown): void {
  ensureDir(path.dirname(p));
  fs.appendFileSync(p, JSON.stringify(obj) + '\n', 'utf8');
}

/** Read a JSONL file into an array of parsed objects. */
export function readJsonl<T = unknown>(p: string): T[] {
  try {
    const content = fs.readFileSync(p, 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

/** Overwrite a file with an array of objects as JSONL. */
export function writeJsonl(p: string, entries: unknown[]): void {
  ensureDir(path.dirname(p));
  const content = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(p, content, 'utf8');
}

// ========== Process Control ==========

/** Synchronous sleep using Atomics.wait. */
export function sleepMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

/** Async sleep via setTimeout. */
export function sleepAsync(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ========== Env File Loader ==========

/** Load a .env-style key=value file into process.env. */
export function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath))
    throw new Error(`Missing secret file: ${envPath}`);

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
}

// ========== CLI Arg Parsing ==========

/** Parse --key=value arguments from argv into a record. */
export function parseArgs(
  argv: string[] = process.argv.slice(2),
): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

/** Get the value following a named flag, or a default. */
export function getArg(
  argv: string[],
  name: string,
  defaultValue: string,
): string {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return defaultValue;
}
