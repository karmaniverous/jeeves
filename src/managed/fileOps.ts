/**
 * Atomic file write (temp file + rename) with Windows EPERM retry.
 *
 * @remarks
 * Synchronous; touches only the target directory. Used by service-side config
 * persistence and by `jeeves install`.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import { chmodSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { getErrorCode } from '../utils.js';

/** Maximum rename retry attempts on EPERM. */
const ATOMIC_WRITE_MAX_RETRIES = 3;

/** Delay between EPERM retries in milliseconds. */
const ATOMIC_WRITE_RETRY_DELAY_MS = 100;

/**
 * Write content to a file atomically via a temp file + rename.
 *
 * @remarks
 * Retries the rename up to three times on EPERM (Windows file-handle
 * contention) with a 100 ms synchronous delay between attempts.
 *
 * When `options.mode` is given, the temp file gets exactly that mode before
 * the rename (so a secret-bearing file is never visible with wider
 * permissions); on Windows only the read-only bit is affected.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - Content to write.
 * @param options - Optional file mode for the written file.
 */
export function atomicWrite(
  filePath: string,
  content: string,
  options: { mode?: number } = {},
): void {
  const dir = dirname(filePath);
  const base = basename(filePath, '.md');
  const tempPath = join(
    dir,
    `.${base}.${String(Date.now())}.${randomUUID().slice(0, 8)}.tmp`,
  );
  const { mode } = options;
  if (mode === undefined) {
    writeFileSync(tempPath, content, 'utf-8');
  } else {
    writeFileSync(tempPath, content, { encoding: 'utf-8', mode });
    chmodSync(tempPath, mode);
  }

  for (let attempt = 0; attempt < ATOMIC_WRITE_MAX_RETRIES; attempt++) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (err: unknown) {
      if (
        getErrorCode(err) !== 'EPERM' ||
        attempt === ATOMIC_WRITE_MAX_RETRIES - 1
      ) {
        try {
          unlinkSync(tempPath);
        } catch {
          /* best-effort cleanup */
        }
        throw err;
      }
      // Synchronous sleep before retry (acceptable in atomic write context)
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        ATOMIC_WRITE_RETRY_DELAY_MS,
      );
    }
  }
}
