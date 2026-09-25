/**
 * Read the jeeves-server `keys._plugin` seed from
 * `<configRoot>/jeeves-server/config.json` (read-only), so `jeeves install`
 * can give the server plugin the same seed the server already trusts.
 *
 * @remarks
 * A key entry is either a seed string or `{ key, scopes?, ... }`. Values
 * that still contain a `${VAR}` placeholder are ignored (the resolved value
 * is not known here). Missing or unparsable files yield undefined.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/** Reads a text file; undefined when it does not exist or can't be read. */
export type ReadTextFile = (path: string) => string | undefined;

const serverConfigSchema = z.looseObject({
  keys: z
    .looseObject({
      _plugin: z
        .union([z.string(), z.looseObject({ key: z.string() })])
        .optional(),
    })
    .optional(),
});

/**
 * Path of the jeeves-server config under a platform config root.
 *
 * @param configRoot - Platform config root.
 * @returns `<configRoot>/jeeves-server/config.json`.
 */
export const serverConfigPath = (configRoot: string): string =>
  join(configRoot, 'jeeves-server', 'config.json');

/**
 * The server's `keys._plugin` seed, if configured as a literal.
 *
 * @param readText - File reader.
 * @param configRoot - Platform config root.
 * @returns The seed, or undefined.
 */
export function readServerPluginKey(
  readText: ReadTextFile,
  configRoot: string,
): string | undefined {
  const text = readText(serverConfigPath(configRoot));
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = serverConfigSchema.safeParse(raw);
  const entry = parsed.success ? parsed.data.keys?._plugin : undefined;
  const seed = typeof entry === 'string' ? entry : entry?.key;
  return seed && !seed.includes('${') ? seed : undefined;
}

/** Node adapter for {@link ReadTextFile}. */
export const nodeReadTextFile: ReadTextFile = (path) => {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
};
