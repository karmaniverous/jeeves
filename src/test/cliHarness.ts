/**
 * Harness for CLI command tests: captured `console.log` output and an
 * environment variable unset for the duration of each test. Test-only
 * helper.
 *
 * @module
 */

import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Capture `console.log` for each test (restored by `vi.restoreAllMocks`).
 *
 * @returns The current test's lines (cleared before each test).
 */
export function useConsoleCapture(): string[] {
  const out: string[] = [];
  beforeEach(() => {
    out.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  return out;
}

/**
 * Unset an environment variable for each test, restoring it afterwards.
 *
 * @param name - Variable name.
 */
export function useUnsetEnv(name: string): void {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[name];
    Reflect.deleteProperty(process.env, name);
  });
  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = saved;
  });
}
