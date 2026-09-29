/**
 * Read the jeeves-server `keys._plugin` entry from
 * `<configRoot>/jeeves-server/config.json` (read-only), so `jeeves install`
 * can keep the server plugin and the server on the same seed.
 *
 * @remarks
 * jeeves-server parses its config with `JSON.parse`, so this does too. A key
 * entry is either a seed string or `{ key, ... }`. The entry is classified,
 * never guessed at:
 * - `noFile`: the config file does not exist (or can't be read);
 * - `unreadable`: the file is not a JSON object;
 * - `absent`: no `keys._plugin` (or an empty string);
 * - `literal`: a seed string, or `{ key }` with a seed string;
 * - `opaque`: present but not a usable literal (a `${VAR}` placeholder or an
 *   unexpected shape, including a non-object `keys`). Its value is unknown here and it is never overwritten.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from '../../../utils.js';

/** Reads a text file; undefined when it does not exist or can't be read. */
export type ReadTextFile = (path: string) => string | undefined;

/** What the server config says about `keys._plugin`. */
export type ServerKeyState =
  | { kind: 'noFile' }
  | { kind: 'unreadable' }
  | { kind: 'absent' }
  | { kind: 'literal'; value: string }
  | { kind: 'opaque' };

/**
 * Path of the jeeves-server config under a platform config root.
 *
 * @param configRoot - Platform config root.
 * @returns `<configRoot>/jeeves-server/config.json`.
 */
export const serverConfigPath = (configRoot: string): string =>
  join(configRoot, 'jeeves-server', 'config.json');

/** Classify one seed string. */
const seedState = (seed: string): ServerKeyState =>
  seed === ''
    ? { kind: 'absent' }
    : seed.includes('${')
      ? { kind: 'opaque' }
      : { kind: 'literal', value: seed };

/**
 * Classify server config text.
 *
 * @param text - File content, or undefined when there is no file.
 * @returns The `keys._plugin` state.
 */
export function parseServerKeyState(text: string | undefined): ServerKeyState {
  if (text === undefined) return { kind: 'noFile' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!isRecord(raw)) return { kind: 'unreadable' };
  const keys = raw['keys'];
  if (keys === undefined) return { kind: 'absent' };
  if (!isRecord(keys)) return { kind: 'opaque' };
  if (keys['_plugin'] === undefined) return { kind: 'absent' };
  const entry = keys['_plugin'];
  if (typeof entry === 'string') return seedState(entry);
  if (isRecord(entry) && typeof entry['key'] === 'string') {
    return seedState(entry['key']);
  }
  return { kind: 'opaque' };
}

/**
 * The server's `keys._plugin` state under a config root.
 *
 * @param readText - File reader.
 * @param configRoot - Platform config root.
 * @returns The state.
 */
export const readServerKeyState = (
  readText: ReadTextFile,
  configRoot: string,
): ServerKeyState =>
  parseServerKeyState(readText(serverConfigPath(configRoot)));

/** Node adapter for {@link ReadTextFile}. */
export const nodeReadTextFile: ReadTextFile = (path) => {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
};
