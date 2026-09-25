/**
 * Config each Jeeves OpenClaw plugin reads from
 * `plugins.entries.<id>.config`: field registry (required, secret, default,
 * CLI option) and the Zod schema of `jeeves install` config input. Pure.
 *
 * @remarks
 * Derived from each plugin's `openclaw.plugin.json` `configSchema`
 * (all four are `additionalProperties: false`, so only these keys may be
 * written) and the code that reads it (`packages/openclaw/src/helpers.ts`):
 * - `configRoot`: runner, server and meta throw at registration without it;
 *   the watcher falls back to `j:/config`, which is wrong off that one box.
 *   One shared value (`--config-root`) for every plugin. Required.
 * - `apiUrl`: every plugin defaults to `http://127.0.0.1:<service port>`.
 * - `pluginKey` (server only): seed for the `_plugin` insider key; must
 *   equal the server's `keys._plugin`. Secret.
 *
 * @module
 */

import { z } from 'zod';

import {
  META_PORT,
  RUNNER_PORT,
  SERVER_PORT,
  WATCHER_PORT,
} from '../../../constants/index.js';

/** How a field that is neither passed nor already set gets a value. */
export type FieldFallback =
  | { kind: 'value'; value: string }
  | { kind: 'serverPluginKeyOrGenerate' };

/** One plugin config key. */
export interface PluginConfigField {
  /** Key under `plugins.entries.<id>.config`. */
  key: string;
  /** CLI option that sets it. */
  option: string;
  /** Fail when no value is passed, present, or defaultable. */
  required: boolean;
  /** Never print the value. */
  secret: boolean;
  /** Fallback when absent (none: required or left unset). */
  fallback?: FieldFallback;
}

const localUrl = (port: number): string => `http://127.0.0.1:${String(port)}`;

const CONFIG_ROOT: PluginConfigField = {
  key: 'configRoot',
  option: '--config-root',
  required: true,
  secret: false,
};

const apiUrl = (component: string, port: number): PluginConfigField => ({
  key: 'apiUrl',
  option: `--${component}-api-url`,
  required: false,
  secret: false,
  fallback: { kind: 'value', value: localUrl(port) },
});

/** Field registry by component short name (`configRoot` first). */
export const PLUGIN_CONFIG_FIELDS: Readonly<
  Record<string, readonly PluginConfigField[]>
> = {
  runner: [CONFIG_ROOT, apiUrl('runner', RUNNER_PORT)],
  watcher: [CONFIG_ROOT, apiUrl('watcher', WATCHER_PORT)],
  server: [
    CONFIG_ROOT,
    apiUrl('server', SERVER_PORT),
    {
      key: 'pluginKey',
      option: '--server-plugin-key',
      required: false,
      secret: true,
      fallback: { kind: 'serverPluginKeyOrGenerate' },
    },
  ],
  meta: [CONFIG_ROOT, apiUrl('meta', META_PORT)],
};

/**
 * Component short name of a Jeeves plugin id.
 *
 * @param pluginId - e.g. `jeeves-watcher-openclaw`.
 * @returns e.g. `watcher`, or undefined for an unknown plugin.
 */
export function componentOf(pluginId: string): string | undefined {
  const match = /^jeeves-([a-z0-9]+)-openclaw$/.exec(pluginId);
  const name = match?.[1];
  return name !== undefined && name in PLUGIN_CONFIG_FIELDS ? name : undefined;
}

const urlField = z.url({ protocol: /^https?$/ }).optional();
const section = z.strictObject({ apiUrl: urlField });

/**
 * Plugin config input: the `--plugin-config <file.json>` shape, and the
 * shape the per-plugin CLI options are collected into.
 */
export const pluginConfigInputSchema = z.strictObject({
  /** JSON Schema pointer (ignored). */
  $schema: z.string().optional(),
  /** Platform config root, written to every Jeeves plugin. */
  configRoot: z.string().min(1).optional(),
  runner: section.optional(),
  watcher: section.optional(),
  server: z
    .strictObject({
      apiUrl: urlField,
      pluginKey: z.string().min(1).optional(),
    })
    .optional(),
  meta: section.optional(),
});

/** Plugin config input. */
export type PluginConfigInput = z.infer<typeof pluginConfigInputSchema>;

/**
 * The value an input provides for one field of one component.
 *
 * @param input - Plugin config input.
 * @param component - Component short name.
 * @param key - Config key.
 * @returns The value, or undefined.
 */
export function inputValue(
  input: PluginConfigInput,
  component: string,
  key: string,
): string | undefined {
  if (key === 'configRoot') return input.configRoot;
  const values: unknown = (input as Record<string, unknown>)[component];
  if (typeof values !== 'object' || values === null) return undefined;
  const value: unknown = (values as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}
