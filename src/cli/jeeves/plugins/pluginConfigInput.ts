/**
 * Collect `jeeves install` / `jeeves update` plugin config input from CLI options and an
 * optional `--plugin-config <file.json>`, validated with Zod.
 *
 * @remarks
 * `configRoot` values are checked with `rejectWindowsDrivePath` and made
 * absolute with `node:path` `resolve` (plugins resolve their config
 * directories from it at gateway start, not from the CLI's cwd). The file is
 * read with `node:fs`; everything else is pure.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { rejectWindowsDrivePath } from '../../../init.js';
import {
  type PluginConfigInput,
  pluginConfigInputSchema,
} from './pluginConfigSchema.js';

/** Per-plugin CLI options (Commander camelCase), validated. */
export const pluginConfigCliOptionsSchema = z.object({
  runnerApiUrl: z.string().optional(),
  watcherApiUrl: z.string().optional(),
  serverApiUrl: z.string().optional(),
  serverPluginKey: z.string().optional(),
  metaApiUrl: z.string().optional(),
});

/** Per-plugin CLI options of `jeeves install` / `update` (Commander camelCase). */
export type PluginConfigCliOptions = z.infer<
  typeof pluginConfigCliOptionsSchema
>;

/**
 * Normalize a configRoot value to an absolute path.
 *
 * @param value - Raw value.
 * @returns Absolute path.
 */
export function normalizeConfigRoot(value: string): string {
  rejectWindowsDrivePath('configRoot', value);
  return resolve(value);
}

/** Validate input and normalize its configRoot. */
function validate(raw: unknown, origin: string): PluginConfigInput {
  const parsed = pluginConfigInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${origin}:\n${z.prettifyError(parsed.error)}`);
  }
  const input = parsed.data;
  return input.configRoot === undefined
    ? input
    : { ...input, configRoot: normalizeConfigRoot(input.configRoot) };
}

const pick = <T extends object>(values: T): T | undefined => {
  const defined = Object.entries(values).filter(([, v]) => v !== undefined);
  return defined.length > 0 ? (Object.fromEntries(defined) as T) : undefined;
};

/**
 * Plugin config input from CLI options.
 *
 * @param opts - Parsed per-plugin options.
 * @param configRoot - `--config-root` value, when passed on the command line.
 * @returns Validated input (only passed values).
 */
export function pluginConfigFromOptions(
  opts: PluginConfigCliOptions,
  configRoot?: string,
): PluginConfigInput {
  opts = pluginConfigCliOptionsSchema.parse(opts);
  const raw = {
    configRoot,
    runner: pick({ apiUrl: opts.runnerApiUrl }),
    watcher: pick({ apiUrl: opts.watcherApiUrl }),
    server: pick({
      apiUrl: opts.serverApiUrl,
      pluginKey: opts.serverPluginKey,
    }),
    meta: pick({ apiUrl: opts.metaApiUrl }),
  };
  return validate(pick(raw) ?? {}, 'plugin config options');
}

/**
 * Load and validate a `--plugin-config` file.
 *
 * @param path - JSON file path.
 * @param readText - File reader (defaults to `node:fs`).
 * @returns Validated input.
 */
export function loadPluginConfigFile(
  path: string,
  readText: (p: string) => string = (p) => readFileSync(p, 'utf-8'),
): PluginConfigInput {
  let raw: unknown;
  try {
    raw = JSON.parse(readText(path));
  } catch (error) {
    throw new Error(`Cannot read --plugin-config ${path}`, { cause: error });
  }
  return validate(raw, `--plugin-config ${path}`);
}
