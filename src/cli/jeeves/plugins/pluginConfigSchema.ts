/**
 * Plugin descriptor table: the config each Jeeves OpenClaw plugin reads from
 * `plugins.entries.<id>.config` (required, secret, default, CLI option and
 * its help), and the Zod schema of `jeeves install` config input. Pure.
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
 * The per-plugin CLI options (`addPluginOptions`), their mapping into
 * config input (`pluginConfigFromOptions`) and config resolution are all
 * driven by {@link PLUGIN_CONFIG_FIELDS}; a new plugin key is one entry here
 * plus its key in {@link pluginConfigInputSchema} (a test checks they agree).
 *
 * @module
 */

import { z } from 'zod';

import {
  META_PORT,
  PLATFORM_COMPONENTS,
  type PlatformComponent,
  RUNNER_PORT,
  SERVER_PORT,
  WATCHER_PORT,
} from '../../../constants/index.js';
import { isRecord } from '../../../utils.js';
import { pluginIdOf } from './pluginSpec.js';

/** How a field that is neither passed nor already set gets a value. */
export type FieldFallback =
  { kind: 'value'; value: string } | { kind: 'serverPluginKeyOrGenerate' };

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
  /**
   * Help for the per-plugin CLI option. Absent for the shared
   * `--config-root`, which is registered with the workspace options.
   */
  help?: { valueName: string; description: string };
}

/** Default service port of each component (the `apiUrl` default). */
const SERVICE_PORTS: Readonly<Record<PlatformComponent, number>> = {
  runner: RUNNER_PORT,
  watcher: WATCHER_PORT,
  server: SERVER_PORT,
  meta: META_PORT,
};

const CONFIG_ROOT: PluginConfigField = {
  key: 'configRoot',
  option: '--config-root',
  required: true,
  secret: false,
};

const apiUrl = (component: PlatformComponent): PluginConfigField => ({
  key: 'apiUrl',
  option: `--${component}-api-url`,
  required: false,
  secret: false,
  fallback: {
    kind: 'value',
    value: `http://127.0.0.1:${String(SERVICE_PORTS[component])}`,
  },
  help: { valueName: 'url', description: `jeeves-${component} plugin apiUrl` },
});

/** Keys a component's plugin has beyond `configRoot` and `apiUrl`. */
const EXTRA_FIELDS: Readonly<
  Partial<Record<PlatformComponent, readonly PluginConfigField[]>>
> = {
  server: [
    {
      key: 'pluginKey',
      option: '--server-plugin-key',
      required: false,
      secret: true,
      fallback: { kind: 'serverPluginKeyOrGenerate' },
      help: {
        valueName: 'seed',
        description:
          "jeeves-server plugin pluginKey, written to both ends (default: the server's keys._plugin, else the plugin's key, else generated; see README)",
      },
    },
  ],
};

const fieldsOf = (c: PlatformComponent): readonly PluginConfigField[] => [
  CONFIG_ROOT,
  apiUrl(c),
  ...(EXTRA_FIELDS[c] ?? []),
];

/** Field registry by component (`configRoot` first, then `apiUrl`). */
export const PLUGIN_CONFIG_FIELDS: Readonly<
  Record<PlatformComponent, readonly PluginConfigField[]>
> = {
  runner: fieldsOf('runner'),
  watcher: fieldsOf('watcher'),
  server: fieldsOf('server'),
  meta: fieldsOf('meta'),
};

/** A field with its own CLI option, and the component it belongs to. */
export interface PluginOptionField {
  /** Component short name. */
  component: PlatformComponent;
  /** The field (with `help`). */
  field: PluginConfigField & {
    help: NonNullable<PluginConfigField['help']>;
  };
}

/** Every per-plugin CLI option, in help order (component order). */
export const PLUGIN_OPTION_FIELDS: readonly PluginOptionField[] =
  PLATFORM_COMPONENTS.flatMap((component) =>
    PLUGIN_CONFIG_FIELDS[component].flatMap((field) =>
      field.help ? [{ component, field: { ...field, help: field.help } }] : [],
    ),
  );

/**
 * Commander's property name for a long option.
 *
 * @param option - e.g. `--runner-api-url`.
 * @returns e.g. `runnerApiUrl`.
 */
export const optionKey = (option: string): string =>
  option
    .replace(/^--/, '')
    .replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/**
 * Component short name of a Jeeves plugin id.
 *
 * @param pluginId - e.g. `jeeves-watcher-openclaw`.
 * @returns e.g. `watcher`, or undefined for an unknown plugin.
 */
export function componentOf(pluginId: string): PlatformComponent | undefined {
  return PLATFORM_COMPONENTS.find((c) => pluginIdOf(c) === pluginId);
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
  const value = isRecord(values) ? values[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}
