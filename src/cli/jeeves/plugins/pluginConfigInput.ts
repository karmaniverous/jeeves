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
  optionKey,
  PLUGIN_OPTION_FIELDS,
  type PluginConfigInput,
  pluginConfigInputSchema,
} from './pluginConfigSchema.js';

/**
 * Per-plugin CLI options (Commander camelCase), validated. One key per
 * {@link PLUGIN_OPTION_FIELDS} entry (a test checks they agree).
 */
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
  const values: Record<string, unknown> =
    pluginConfigCliOptionsSchema.parse(opts);
  const sections: Record<string, Record<string, unknown>> = {};
  for (const { component, field } of PLUGIN_OPTION_FIELDS) {
    const value = values[optionKey(field.option)];
    if (value !== undefined) {
      sections[component] = { ...sections[component], [field.key]: value };
    }
  }
  return validate(
    { ...(configRoot === undefined ? {} : { configRoot }), ...sections },
    'plugin config options',
  );
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
