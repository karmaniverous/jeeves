/**
 * Resolve the `plugins.entries.<id>.config` values `jeeves install` and
 * `jeeves update` write,
 * with precedence option \> `--plugin-config` file \> existing value \>
 * default \> error. Pure apart from injected ports (file read, secret
 * generation).
 *
 * @remarks
 * - An existing value is never overwritten unless passed explicitly (CLI
 *   option or `--plugin-config`). An explicit value equal to the existing one
 *   is not rewritten.
 * - Defaults: `apiUrl` → the service's local port; `configRoot` → the
 *   value inherited from `JEEVES_CONFIG_ROOT` / `jeeves.config.json` (never
 *   the built-in `./config`); server `pluginKey` → decided together with
 *   the server's `keys._plugin` (see `serverKeySync.ts`), which may add a
 *   planned server config write to the result.
 * - Required values that resolve to nothing are collected across all plugins
 *   and thrown as one {@link MissingPluginConfigError} before anything runs.
 * - Every secret value is returned in `secrets` so callers can redact it.
 *
 * @module
 */

import type { PluginsConfig } from './configPatch.js';
import { configValuePath } from './configPatch.js';
import type { ConfigSetOperation } from './openclawCommands.js';
import {
  componentOf,
  inputValue,
  PLUGIN_CONFIG_FIELDS,
  type PluginConfigField,
  type PluginConfigInput,
} from './pluginConfigSchema.js';
import { decideServerPluginKey, type ServerKeyWrite } from './serverKeySync.js';
import { serverConfigPath, type ServerKeyState } from './serverPluginKey.js';

/** Where a resolved value came from. */
export type ValueSource =
  | 'option'
  | 'file'
  | 'existing'
  | 'default'
  | 'jeeves config root'
  | 'server config'
  | 'generated';

/** One resolved plugin config value. */
export interface ResolvedConfigValue {
  /** OpenClaw plugin id. */
  pluginId: string;
  /** Config key. */
  key: string;
  /** Value (existing values may be non-string). */
  value: unknown;
  /** Provenance. */
  source: ValueSource;
  /** Never print the value. */
  secret: boolean;
  /** Whether a `config set` operation is emitted for it. */
  write: boolean;
}

/** Inputs of {@link resolvePluginConfig}. */
export interface PluginConfigRequest {
  /** Values from per-plugin CLI options (highest precedence). */
  options: PluginConfigInput;
  /** Values from `--plugin-config <file.json>`. */
  file: PluginConfigInput;
  /** configRoot from `JEEVES_CONFIG_ROOT` or `jeeves.config.json`. */
  inheritedConfigRoot?: string;
  /** State of the server's `keys._plugin` under a config root. */
  readServerKey: (configRoot: string) => ServerKeyState;
  /** Generate a new secret seed. */
  generateSecret: () => string;
}

/** Result of {@link resolvePluginConfig}. */
export interface PluginConfigResolution {
  /** `config set` operations (only values to write). */
  ops: ConfigSetOperation[];
  /** Every resolved value, for display. */
  values: ResolvedConfigValue[];
  /** Secret values to redact from all output. */
  secrets: string[];
  /** Target plugin ids with no known config schema (left untouched). */
  unknownPluginIds: string[];
  /** Planned write of the server's `keys._plugin` (secret value). */
  serverKeyWrite?: ServerKeyWrite;
  /** Warnings to print (no secrets). */
  warnings?: string[];
}

/** A required value that nothing provides. */
export interface MissingConfigValue {
  /** OpenClaw plugin id. */
  pluginId: string;
  /** Config key. */
  key: string;
  /** CLI option that sets it. */
  option: string;
}

/** Thrown when required plugin config is missing; lists every gap. */
export class MissingPluginConfigError extends Error {
  /** The missing values. */
  readonly missing: MissingConfigValue[];

  /** @param missing - The missing values (non-empty). */
  constructor(missing: MissingConfigValue[]) {
    const byOption = new Map<string, MissingConfigValue[]>();
    for (const m of missing) {
      byOption.set(m.option, [...(byOption.get(m.option) ?? []), m]);
    }
    const lines = [...byOption].map(
      ([option, ms]) =>
        `  ${option} <value>: ${ms[0].key} for ${ms.map((m) => m.pluginId).join(', ')}`,
    );
    super(
      [
        'Missing required plugin config (not passed and not already set in openclaw.json):',
        ...lines,
        'Pass these options (or set the values in --plugin-config <file.json>) and re-run. configRoot is also taken from JEEVES_CONFIG_ROOT or jeeves.config.json core.configRoot.',
      ].join('\n'),
    );
    this.name = 'MissingPluginConfigError';
    this.missing = missing;
  }
}

const isPresent = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

/** The existing `config` object of a plugin entry. */
function existingConfig(
  plugins: PluginsConfig,
  pluginId: string,
): Record<string, unknown> {
  const entry = plugins.entries?.[pluginId];
  if (typeof entry !== 'object' || entry === null) return {};
  const config = (entry as { config?: unknown }).config;
  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

type Candidate = { value: string; source: ValueSource } | undefined;

/** A value passed on the command line or in the `--plugin-config` file. */
function explicitValue(
  request: PluginConfigRequest,
  component: string,
  key: string,
): Candidate {
  const fromOption = inputValue(request.options, component, key);
  if (fromOption !== undefined) return { value: fromOption, source: 'option' };
  const fromFile = inputValue(request.file, component, key);
  return fromFile === undefined
    ? undefined
    : { value: fromFile, source: 'file' };
}

/** Fallback for a field that is neither explicit nor existing. */
function fallbackFor(
  field: PluginConfigField,
  request: PluginConfigRequest,
): Candidate {
  if (field.key === 'configRoot' && request.inheritedConfigRoot) {
    return { value: request.inheritedConfigRoot, source: 'jeeves config root' };
  }
  const fallback = field.fallback;
  return fallback?.kind === 'value'
    ? { value: fallback.value, source: 'default' }
    : undefined;
}

/** Resolve the server plugin key for both ends (see `serverKeySync.ts`). */
function resolveServerKey(
  request: PluginConfigRequest,
  explicit: Candidate,
  current: unknown,
  root: string,
  result: PluginConfigResolution,
): { value: string; source: ValueSource; write: boolean } {
  const decision = decideServerPluginKey({
    ...(explicit
      ? {
          explicit: {
            value: explicit.value,
            source: explicit.source === 'file' ? 'file' : 'option',
          },
        }
      : {}),
    ...(typeof current === 'string' && current !== ''
      ? { plugin: current }
      : {}),
    server: request.readServerKey(root),
    serverPath: serverConfigPath(root),
    generate: request.generateSecret,
  });
  if (decision.serverWrite) result.serverKeyWrite = decision.serverWrite;
  if (decision.warning) {
    result.warnings = [...(result.warnings ?? []), decision.warning];
  }
  return {
    value: decision.value,
    source: decision.source,
    write: decision.writePlugin,
  };
}

/**
 * Resolve the plugin config for the given install targets.
 *
 * @param plugins - Current `plugins` config slice.
 * @param pluginIds - Plugins being installed.
 * @param request - Explicit values, inherited defaults and ports.
 * @returns Operations, display values and secrets.
 * @throws MissingPluginConfigError when a required value is missing.
 */
export function resolvePluginConfig(
  plugins: PluginsConfig,
  pluginIds: readonly string[],
  request: PluginConfigRequest,
): PluginConfigResolution {
  const result: PluginConfigResolution = {
    ops: [],
    values: [],
    secrets: [],
    unknownPluginIds: [],
  };
  const missing: MissingConfigValue[] = [];
  for (const pluginId of pluginIds) {
    const component = componentOf(pluginId);
    if (component === undefined) {
      result.unknownPluginIds.push(pluginId);
      continue;
    }
    const existing = existingConfig(plugins, pluginId);
    const resolved: Record<string, unknown> = {};
    for (const field of PLUGIN_CONFIG_FIELDS[component]) {
      const explicit = explicitValue(request, component, field.key);
      const current = existing[field.key];
      let value: unknown;
      let source: ValueSource;
      let write: boolean;
      if (field.fallback?.kind === 'serverPluginKeyOrGenerate') {
        const root = resolved['configRoot'];
        // Without configRoot the missing-config error below is the answer.
        if (typeof root !== 'string') continue;
        ({ value, source, write } = resolveServerKey(
          request,
          explicit,
          current,
          root,
          result,
        ));
      } else if (explicit) {
        ({ value, source } = explicit);
        write = explicit.value !== current;
      } else if (isPresent(current)) {
        [value, source, write] = [current, 'existing', false];
      } else {
        const fb = fallbackFor(field, request);
        if (!fb) {
          if (field.required) {
            missing.push({ pluginId, key: field.key, option: field.option });
          }
          continue;
        }
        ({ value, source } = fb);
        write = true;
      }
      resolved[field.key] = value;
      if (field.secret && typeof value === 'string') result.secrets.push(value);
      result.values.push({
        pluginId,
        key: field.key,
        value,
        source,
        secret: field.secret,
        write,
      });
      if (write) {
        result.ops.push({ path: configValuePath(pluginId, field.key), value });
      }
    }
  }
  if (missing.length > 0) throw new MissingPluginConfigError(missing);
  return result;
}
