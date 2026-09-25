/**
 * Atomic file write (temp file + rename) with Windows EPERM retry.
 *
 * @remarks
 * Synchronous; touches only the target directory. Used by service-side config
 * persistence and by `jeeves install`.
 */

import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

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
 * @param filePath - Absolute path to the target file.
 * @param content - Content to write.
 */
export function atomicWrite(filePath: string, content: string): void {
  const dir = dirname(filePath);
  const base = basename(filePath, '.md');
  const tempPath = join(
    dir,
    `.${base}.${String(Date.now())}.${randomUUID().slice(0, 8)}.tmp`,
  );
  writeFileSync(tempPath, content, 'utf-8');

  for (let attempt = 0; attempt < ATOMIC_WRITE_MAX_RETRIES; attempt++) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (err: unknown) {
      const isEperm =
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'EPERM';
      if (!isEperm || attempt === ATOMIC_WRITE_MAX_RETRIES - 1) {
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
