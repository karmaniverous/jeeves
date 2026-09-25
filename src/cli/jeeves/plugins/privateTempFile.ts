/**
 * Owner-only temporary files for passing secrets to child processes without
 * putting them on a command line.
 *
 * @remarks
 * `openclaw config set --batch-file <path>` reads its operations from a file,
 * so plugin secrets (the server `pluginKey`) never appear in the process list.
 * The file lives in a fresh directory from `mkdtemp` under the OS temp dir:
 * - POSIX: `mkdtemp` creates the directory with mode `0700`; the file is
 *   written with mode `0600` and flag `wx` (never reuses an existing path).
 * - Windows: modes are ignored, so the directory ACL is replaced before the
 *   file is written: `icacls <dir> /inheritance:r /grant:r <user>:(OI)(CI)F`,
 *   which leaves the current user as the only principal; the file inherits
 *   that. If `icacls` fails, a warning is logged and the file is still
 *   written: the directory is inside the per-user `%TEMP%`, which only the
 *   user (plus SYSTEM and Administrators) can open by default.
 *
 * The directory is removed in `finally`, whether the callback succeeds or
 * throws.
 *
 * @module
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { getErrorMessage } from '../../../utils.js';
import { type CommandRunner, describeExit } from './commandRunner.js';

/** Filesystem and ACL port for {@link withPrivateTempFile}. */
export interface PrivateTempFiles {
  /** Create a fresh directory (mode 0700 on POSIX). */
  makePrivateDir: () => string;
  /**
   * Restrict an existing directory to the current user.
   *
   * @returns `undefined` on success, else a reason (logged as a warning).
   */
  restrictDir: (dir: string) => Promise<string | undefined>;
  /** Create a new file (owner read/write only); fail if it exists. */
  writeNewFile: (path: string, content: string) => void;
  /** Recursively remove a directory (no error if already gone). */
  removeDir: (dir: string) => void;
}

/**
 * Write `content` to an owner-only temp file, run `fn` with its path, and
 * always delete the file and its directory afterwards.
 *
 * @param files - Temp file port.
 * @param fileName - File name inside the private directory.
 * @param content - File content (may contain secrets).
 * @param fn - Callback receiving the file path.
 * @param warn - Warning logger (ACL restriction failure).
 * @returns The callback's result.
 */
export async function withPrivateTempFile<T>(
  files: PrivateTempFiles,
  fileName: string,
  content: string,
  fn: (path: string) => Promise<T>,
  warn: (line: string) => void,
): Promise<T> {
  const dir = files.makePrivateDir();
  try {
    const problem = await files.restrictDir(dir);
    if (problem !== undefined) {
      warn(
        `warning: could not restrict ${dir} to the current user (${problem}); relying on the private temp directory`,
      );
    }
    const path = join(dir, fileName);
    files.writeNewFile(path, content);
    return await fn(path);
  } finally {
    files.removeDir(dir);
  }
}

/**
 * `icacls` arguments that make `dir` accessible to `user` only (inherited
 * entries removed; full control granted and inherited by files).
 *
 * @param dir - Directory.
 * @param user - Account, e.g. `DOMAIN\user`.
 * @returns Argument vector.
 */
export const icaclsRestrictArgs = (dir: string, user: string): string[] => [
  dir,
  '/inheritance:r',
  '/grant:r',
  `${user}:(OI)(CI)F`,
];

/**
 * Current Windows account in `DOMAIN\user` form (or just `user`).
 *
 * @param env - Environment.
 * @param username - Account name.
 * @returns Qualified account name.
 */
export function windowsAccount(
  env: NodeJS.ProcessEnv = process.env,
  username: string = userInfo().username,
): string {
  const domain = env['USERDOMAIN']?.trim();
  return domain ? `${domain}\\${username}` : username;
}

/**
 * Node adapter for {@link PrivateTempFiles}.
 *
 * @param runner - Command runner (for `icacls` on Windows).
 * @param platform - Target platform.
 * @param baseDir - Parent of the private directories.
 * @returns The adapter.
 */
export function createNodePrivateTempFiles(
  runner: CommandRunner,
  platform: NodeJS.Platform = process.platform,
  baseDir: string = tmpdir(),
): PrivateTempFiles {
  return {
    makePrivateDir: () => mkdtempSync(join(baseDir, 'jeeves-')),
    restrictDir: async (dir) => {
      if (platform !== 'win32') return undefined; // mkdtemp already made it 0700
      const args = icaclsRestrictArgs(dir, windowsAccount());
      try {
        const result = await runner('icacls', args);
        return result.exitCode === 0
          ? undefined
          : describeExit('icacls', args, result.exitCode);
      } catch (error) {
        return getErrorMessage(error);
      }
    },
    writeNewFile: (path, content) => {
      writeFileSync(path, content, {
        encoding: 'utf-8',
        mode: 0o600,
        flag: 'wx',
      });
    },
    removeDir: (dir) => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
