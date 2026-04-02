/**
 * Shared crash-handler wrapper for runner job scripts.
 * Catches uncaught errors, logs them, and exits with code 1.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Wrap a script's main function with crash handling.
 * On uncaught errors, appends to `_crash.log` in `crashDir` and exits.
 *
 * @param name - Script identifier for the crash log.
 * @param fn - Main function to execute (sync or async).
 * @param crashDir - Directory for crash logs (default: current working directory).
 */
export function runScript(
  name: string,
  fn: () => void | Promise<void>,
  crashDir = process.cwd(),
): void {
  const execute = (): void => {
    const result = fn();
    if (result instanceof Promise) {
      result.catch((err: unknown) => {
        handleCrash(name, err, crashDir);
      });
    }
  };

  try {
    execute();
  } catch (err: unknown) {
    handleCrash(name, err, crashDir);
  }
}

function handleCrash(name: string, err: unknown, crashDir: string): never {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  const entry = `[${new Date().toISOString()}] CRASH (${name}): ${message}\n`;

  try {
    fs.mkdirSync(crashDir, { recursive: true });
    fs.appendFileSync(path.join(crashDir, '_crash.log'), entry);
  } catch {
    // Best effort — don't crash the crash handler.
  }

  console.error(entry);
  process.exit(1);
}
