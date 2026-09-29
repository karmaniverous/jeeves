/**
 * Scripted `CommandExec` for systemd tests.
 *
 * @remarks
 * Each command maps to stdout (string) or a thrown error. Unscripted
 * commands throw, so tests fail loudly on unexpected calls.
 */

import type { CommandExec } from '../discovery/systemdUnit.js';

/** A scripted exec plus the list of commands it received. */
export interface FakeExec {
  /** The command runner. */
  exec: CommandExec;
  /** Commands received, in order. */
  calls: string[];
}

/**
 * Build an error shaped like a failed `execSync` call.
 *
 * @param stderr - Captured stderr.
 * @returns The error.
 */
export function execFailure(stderr: string): Error {
  return Object.assign(new Error(`Command failed\n${stderr}`), { stderr });
}

/**
 * Create a scripted exec.
 *
 * @param script - Command to stdout or error.
 * @returns The fake.
 */
export function fakeExec(script: Record<string, string | Error>): FakeExec {
  const calls: string[] = [];
  const exec: CommandExec = (cmd) => {
    calls.push(cmd);
    if (!(cmd in script)) throw execFailure(`unscripted: ${cmd}`);
    const out = script[cmd];
    if (out instanceof Error) throw out;
    return out;
  };
  return { exec, calls };
}
