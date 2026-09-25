/**
 * Write the jeeves-server `keys._plugin` seed into
 * `<configRoot>/jeeves-server/config.json`: lock, re-check, timestamped
 * backup, atomic write. Only `jeeves install`/`jeeves update` call this.
 *
 * @remarks
 * - Locked with core `withFileLock` (the `<file>.lock` convention the Jeeves
 *   services use), then the file is re-read and its `keys._plugin` must still
 *   be in the planned state; otherwise nothing is written.
 * - Backup first: a copy beside the file, `config.json.bak-<UTC timestamp>`,
 *   never overwriting an existing file.
 * - Only `keys._plugin` (or `keys._plugin.key` for the object form) changes,
 *   as a minimal text edit with `jsonc-parser` (`modify` + `applyEdits`):
 *   every other byte (key order, inline layout, number spelling) stays as
 *   it was; inserted text uses the file's own indentation and line
 *   ending. The result must still parse with `JSON.parse` (jeeves-server's
 *   loader) or nothing is written.
 * - Written with core `atomicWrite` (temp file + rename) with the original
 *   file mode applied to the temp file before the rename.
 *
 * @module
 */

import { constants, copyFileSync, readFileSync, statSync } from 'node:fs';

import { applyEdits, type FormattingOptions, modify } from 'jsonc-parser';

import { withFileLock } from '../../../managed/fileLock.js';
import { atomicWrite } from '../../../managed/fileOps.js';
import type { ServerKeyWrite } from './serverKeySync.js';
import { parseServerKeyState } from './serverPluginKey.js';

/** Filesystem port of {@link writeServerPluginKey}. */
export interface ServerConfigFiles {
  /** Read a UTF-8 file. */
  read: (path: string) => string;
  /** Copy a file; fail if the destination exists. */
  copyNew: (src: string, dest: string) => void;
  /** Replace a file atomically, keeping its mode. */
  writeAtomic: (path: string, content: string) => void;
  /** Run `fn` holding the file's lock. */
  withLock: (path: string, fn: () => void) => Promise<void>;
}

/** Writes a planned `keys._plugin` change; returns the backup path. */
export type ServerConfigWriter = (write: ServerKeyWrite) => Promise<string>;

/**
 * Backup path for a file at a moment.
 *
 * @param path - Original file.
 * @param now - Moment.
 * @returns `<path>.bak-YYYYMMDDTHHMMSSmmmZ`.
 */
export const backupPath = (path: string, now: Date): string =>
  `${path}.bak-${now.toISOString().replace(/[-:.]/g, '')}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Formatting of a JSON text (indent unit and line ending) for inserted text.
 *
 * @param text - JSON text.
 * @returns `jsonc-parser` formatting options.
 */
export function detectFormatting(text: string): FormattingOptions {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? '  ';
  return indent.startsWith('\t')
    ? { insertSpaces: false, tabSize: 1, eol }
    : { insertSpaces: true, tabSize: indent.length, eol };
}

/**
 * Set the `keys._plugin` seed in server config text, changing no other
 * value.
 *
 * @param text - Current file content (a JSON object).
 * @param value - Seed.
 * @returns New content (same indentation, line endings and final newline).
 * @throws Error when the text is not a JSON object.
 */
export function setPluginKeyInText(text: string, value: string): string {
  const raw: unknown = JSON.parse(text);
  if (!isRecord(raw)) throw new Error('server config is not a JSON object');
  const keys = raw['keys'];
  if (keys !== undefined && !isRecord(keys)) {
    throw new Error('server config "keys" is not an object');
  }
  const path = isRecord(keys?.['_plugin'])
    ? ['keys', '_plugin', 'key']
    : ['keys', '_plugin'];
  const edits = modify(text, path, value, {
    formattingOptions: detectFormatting(text),
  });
  const next = applyEdits(text, edits);
  // jeeves-server parses with JSON.parse: never write anything it can't read.
  JSON.parse(next);
  return next;
}

/** Whether the file's current state is the planned one. */
function matches(text: string, write: ServerKeyWrite): boolean {
  const state = parseServerKeyState(text);
  return write.expect.kind === 'absent'
    ? state.kind === 'absent'
    : state.kind === 'literal' && state.value === write.expect.value;
}

/**
 * Back up the server config and set `keys._plugin`, under the file lock.
 *
 * @param files - Filesystem port.
 * @param write - Planned write.
 * @param now - Clock (backup timestamp).
 * @returns The backup path.
 * @throws Error when the file changed since the plan (nothing written).
 */
export async function writeServerPluginKey(
  files: ServerConfigFiles,
  write: ServerKeyWrite,
  now: () => Date = () => new Date(),
): Promise<string> {
  let backup = '';
  await files.withLock(write.path, () => {
    const text = files.read(write.path);
    if (!matches(text, write)) {
      throw new Error(
        `keys._plugin in ${write.path} changed since the plan was made; nothing was written. Re-run the command.`,
      );
    }
    const next = setPluginKeyInText(text, write.value);
    backup = backupPath(write.path, now());
    files.copyNew(write.path, backup);
    files.writeAtomic(write.path, next);
  });
  return backup;
}

/** Node adapter for {@link ServerConfigFiles}. */
export const nodeServerConfigFiles: ServerConfigFiles = {
  read: (path) => readFileSync(path, 'utf-8'),
  copyNew: (src, dest) => {
    copyFileSync(src, dest, constants.COPYFILE_EXCL);
  },
  writeAtomic: (path, content) => {
    atomicWrite(path, content, { mode: statSync(path).mode & 0o777 });
  },
  withLock: (path, fn) => withFileLock(path, fn),
};

/**
 * Production {@link ServerConfigWriter}.
 *
 * @param files - Filesystem port.
 * @param now - Clock.
 * @returns The writer.
 */
export const createServerConfigWriter =
  (
    files: ServerConfigFiles = nodeServerConfigFiles,
    now?: () => Date,
  ): ServerConfigWriter =>
  (write) =>
    writeServerPluginKey(files, write, now);
