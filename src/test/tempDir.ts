/**
 * Per-test temporary directory. Test-only helper.
 *
 * @module
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

/**
 * Create a fresh temp dir before each test and remove it after.
 *
 * @param prefix - Directory name prefix (e.g. `jeeves-install-`).
 * @returns Getter for the current test's directory (call it inside hooks
 *   or tests, not at collection time).
 */
export function useTempDir(prefix: string): () => string {
  let dir: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), prefix));
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });
  return () => {
    if (!dir) throw new Error('useTempDir: no test is running');
    return dir;
  };
}
