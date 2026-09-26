/**
 * Test doubles for the {@link CommandRunner} and {@link PrivateTempFiles}
 * ports: scripted responses keyed by command-line prefix, with every call
 * recorded; in-memory temp files that record what was written. Test-only
 * helpers.
 *
 * @module
 */

import type { CommandResult, CommandRunner } from './commandRunner.js';
import type { PrivateTempFiles } from './privateTempFile.js';

/** A recorded call. */
export interface RecordedCall {
  /** Executable. */
  command: string;
  /** Argument vector. */
  args: string[];
}

/** Scripted runner plus its call log. */
export interface FakeRunner {
  /** The runner port. */
  runner: CommandRunner;
  /** Calls in order. */
  calls: RecordedCall[];
  /** Calls rendered as `cmd arg arg` strings. */
  lines: () => string[];
}

/** Successful result helper. */
export const ok = (stdout = ''): CommandResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
});

/** Failed result helper. */
export const failed = (stderr = 'boom', exitCode = 1): CommandResult => ({
  exitCode,
  stdout: '',
  stderr,
});

/**
 * Create a fake runner.
 *
 * @param script - Map of command-line prefix → result or result sequence.
 *   Unmatched calls succeed with empty output.
 * @returns The fake.
 */
export function fakeRunner(
  script: Record<string, CommandResult | CommandResult[]> = {},
): FakeRunner {
  const calls: RecordedCall[] = [];
  const counters = new Map<string, number>();
  const runner: CommandRunner = (command, args) => {
    calls.push({ command, args: [...args] });
    const line = [command, ...args].join(' ');
    const key: string | undefined = Object.keys(script)
      .filter((k) => line.startsWith(k))
      .sort((a, b) => b.length - a.length)
      .at(0);
    if (key === undefined) return Promise.resolve(ok());
    const entry = script[key];
    if (!Array.isArray(entry)) return Promise.resolve(entry);
    const n = counters.get(key) ?? 0;
    counters.set(key, n + 1);
    return Promise.resolve(entry[Math.min(n, entry.length - 1)]);
  };
  return {
    runner,
    calls,
    lines: () => calls.map((c) => [c.command, ...c.args].join(' ')),
  };
}

/** In-memory temp files plus a record of what happened to them. */
export interface FakeTempFiles {
  /** The port. */
  files: PrivateTempFiles;
  /** Files written, in order. */
  written: { path: string; content: string }[];
  /** Directories restricted. */
  restricted: string[];
  /** Directories removed. */
  removed: string[];
  /** Parsed content of the n-th written batch file (default: last). */
  batch: (n?: number) => unknown;
}

/**
 * Create fake temp files.
 *
 * @param restrictProblem - Reason returned by `restrictDir` (default: ok).
 * @returns The fake.
 */
export function fakeTempFiles(restrictProblem?: string): FakeTempFiles {
  const written: { path: string; content: string }[] = [];
  const restricted: string[] = [];
  const removed: string[] = [];
  let n = 0;
  const files: PrivateTempFiles = {
    makePrivateDir: () => `/tmp/jeeves-${String(++n)}`,
    restrictDir: (dir) => {
      restricted.push(dir);
      return Promise.resolve(restrictProblem);
    },
    writeNewFile: (path, content) => {
      written.push({ path: path.replace(/\\/g, '/'), content });
    },
    removeDir: (dir) => {
      removed.push(dir);
    },
  };
  return {
    files,
    written,
    restricted,
    removed,
    batch: (i) => {
      const entry = i === undefined ? written.at(-1) : written[i];
      return entry ? (JSON.parse(entry.content) as unknown) : undefined;
    },
  };
}
