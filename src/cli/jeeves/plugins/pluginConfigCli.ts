/**
 * Plugin options shared by `jeeves install` and `jeeves update`: workspace
 * and config root, per-plugin config values, `--plugin-config` and
 * `--force-reinstall`, plus the {@link PluginConfigRequest} built from them.
 *
 * @remarks
 * Both commands resolve plugin config the same way: option \> `--plugin-config`
 * \> existing value \> default \> error. Existing values are never overwritten
 * unless passed explicitly. `configRoot` also comes from `JEEVES_CONFIG_ROOT`
 * or `jeeves.config.json` `core.configRoot` (never the built-in `./config`).
 *
 * @module
 */

import { z } from 'zod';

import type { ResolvedValue } from '../../../config/index.js';
import {
  loadPluginConfigFile,
  normalizeConfigRoot,
  type PluginConfigCliOptions,
  pluginConfigCliOptionsSchema,
  pluginConfigFromOptions,
} from './pluginConfigInput.js';
import type { PluginConfigRequest } from './pluginConfigResolve.js';
import { PLUGIN_OPTION_FIELDS } from './pluginConfigSchema.js';
import { createPluginConfigRequest } from './pluginDeps.js';
import type { InstallOptions } from './workflows.js';

/** Parsed values of the options added by {@link addPluginOptions}. */
export const pluginCliOptionsSchema = pluginConfigCliOptionsSchema.extend({
  workspace: z.string().optional(),
  configRoot: z.string().optional(),
  pluginConfig: z.string().optional(),
  forceReinstall: z.boolean().optional(),
});

/** Parsed shared plugin options. */
export type PluginCliOptions = z.infer<typeof pluginCliOptionsSchema>;

/** Anything options can be added to (a Commander command). */
interface OptionTarget {
  option(flags: string, description?: string): unknown;
}

/**
 * Add the shared plugin options to a command. Read them back in the action
 * with {@link pluginCliOptionsSchema}.
 *
 * @param command - Commander command.
 */
export function addPluginOptions(command: OptionTarget): void {
  const options: [string, string][] = [
    [
      '-w, --workspace <path>',
      'Workspace root path (also where jeeves.config.json is read)',
    ],
    [
      '-c, --config-root <path>',
      'Platform config root path; also the configRoot of every Jeeves plugin',
    ],
    ...PLUGIN_OPTION_FIELDS.map(({ field }): [string, string] => [
      `${field.option} <${field.help.valueName}>`,
      field.help.description,
    ]),
    [
      '--plugin-config <file>',
      'JSON file with plugin config: { configRoot, runner: { apiUrl }, watcher, server: { apiUrl, pluginKey }, meta }',
    ],
    [
      '--force-reinstall',
      'Reinstall plugins even when the exact version is already installed',
    ],
  ];
  for (const [flags, description] of options) {
    command.option(flags, description);
  }
}

/**
 * Build the plugin config request from parsed options.
 *
 * @param opts - Parsed per-plugin options and `--plugin-config`.
 * @param configRoot - Resolved `core.configRoot` with provenance.
 * @returns The request (validated; the file is read now, so bad input fails
 *   before anything is written).
 */
function pluginConfigRequestFromCli(
  opts: Pick<PluginCliOptions, 'pluginConfig'> & PluginConfigCliOptions,
  configRoot: ResolvedValue<string>,
): PluginConfigRequest {
  const file = opts.pluginConfig ? loadPluginConfigFile(opts.pluginConfig) : {};
  const inherited =
    (configRoot.provenance === 'env' || configRoot.provenance === 'file') &&
    configRoot.value.trim() !== ''
      ? normalizeConfigRoot(configRoot.value)
      : undefined;
  return createPluginConfigRequest(
    pluginConfigFromOptions(
      opts,
      configRoot.provenance === 'flag' ? configRoot.value : undefined,
    ),
    file,
    inherited,
  );
}

/**
 * Install options (plugin config request and reinstall policy) of
 * `jeeves install` / `jeeves update`.
 *
 * @param opts - Parsed shared plugin options.
 * @param configRoot - Resolved `core.configRoot` with provenance.
 * @returns Options for `prepareInstall` / `installPlugins` (config input is
 *   validated now, before anything is written).
 */
export function installOptionsFromCli(
  opts: PluginCliOptions,
  configRoot: ResolvedValue<string>,
): InstallOptions {
  return {
    configRequest: pluginConfigRequestFromCli(opts, configRoot),
    ...(opts.forceReinstall ? { forceReinstall: true } : {}),
  };
}
