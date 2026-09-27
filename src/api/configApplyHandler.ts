/**
 * Factory for a framework-agnostic config apply HTTP handler.
 *
 * @remarks
 * Derives the config file path from the descriptor, deep-merges the patch
 * into the raw file contents (or replaces them), validates the merged object
 * against the descriptor's Zod schema, writes the merged object atomically
 * with the file's existing mode, and calls the optional `onConfigApply`
 * callback.
 *
 * The schema's parsed output is never written: keys the schema doesn't know
 * are kept and defaults are not materialized in the file.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { getComponentConfigDir, getComponentConfigPath } from '../init.js';
import { atomicWrite } from '../managed/fileOps.js';
import { getErrorMessage } from '../utils.js';

/** Request shape for the config apply handler. */
export interface ConfigApplyRequest {
  /** Config patch to apply (deep-merged with existing config). */
  patch: Record<string, unknown>;
  /** When true, replace the entire config instead of merging. */
  replace?: boolean;
}

/** Result shape returned by the config apply handler. */
export interface ConfigApplyResult {
  /** HTTP status code. */
  status: number;
  /** Response body. */
  body: unknown;
}

/** Config apply handler function signature. */
export type ConfigApplyHandler = (
  request: ConfigApplyRequest,
) => Promise<ConfigApplyResult>;

/**
 * Deep-merge two plain objects. Arrays and non-objects are replaced.
 *
 * @param target - Base object.
 * @param source - Object to merge on top.
 * @returns A new merged object.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const tVal = target[key];
    const sVal = source[key];

    if (isPlainObject(tVal) && isPlainObject(sVal)) {
      result[key] = deepMerge(tVal, sVal);
    } else {
      result[key] = sVal;
    }
  }

  return result;
}

/**
 * Check if a value is a plain object (not null, not an array).
 *
 * @param val - Value to check.
 * @returns True if the value is a plain object.
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Mode for a config file core creates (it may hold secrets). */
const NEW_CONFIG_MODE = 0o600;

/** Raw config file contents plus the mode to write it back with. */
interface RawConfigFile {
  /** Parsed JSON object (empty when the file doesn't exist). */
  config: Record<string, unknown>;
  /** Permission bits to give the written file. */
  mode: number;
}

/**
 * Read a JSON config file as a raw object, with its permission bits.
 *
 * @param filePath - Absolute path to the file.
 * @returns The raw object and mode; `{}` and 0600 when the file is missing.
 * @throws Error when the file exists but is not a JSON object, so an apply
 *   never overwrites a file it could not read.
 */
function readRawConfigFile(filePath: string): RawConfigFile {
  if (!existsSync(filePath)) return { config: {}, mode: NEW_CONFIG_MODE };
  const mode = statSync(filePath).mode & 0o777;
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
  if (!isPlainObject(parsed)) {
    throw new Error('config file does not contain a JSON object');
  }
  return { config: parsed, mode };
}

/**
 * Write the merged config, keeping the file's mode.
 *
 * @remarks
 * The mode is applied to the temp file before the rename, so a
 * secret-bearing file is never visible with wider permissions. On Windows
 * file modes are advisory, so none is applied there.
 *
 * @param filePath - Absolute path to the file.
 * @param config - Merged raw config object.
 * @param mode - Permission bits to keep.
 */
function writeRawConfigFile(
  filePath: string,
  config: Record<string, unknown>,
  mode: number,
): void {
  const json = JSON.stringify(config, null, 2) + '\n';
  atomicWrite(filePath, json, process.platform === 'win32' ? {} : { mode });
}

/**
 * Create a framework-agnostic config apply handler.
 *
 * @remarks
 * The handler:
 * 1. Reads the raw config from `{configRoot}/jeeves-{name}/{configFileName}`
 *    (an unreadable file fails with 500 and is left untouched)
 * 2. Deep-merges the patch into it (or replaces it if `replace: true`)
 * 3. Validates the merged object against `descriptor.configSchema`
 * 4. Writes the merged object (not the schema's parsed output) atomically,
 *    keeping the existing file mode (0600 for a new file)
 * 5. Calls `descriptor.onConfigApply` with the validated (parsed) config
 *
 * The response `config` is the validated (parsed) config, as before.
 *
 * @param descriptor - The component descriptor.
 * @param configPath - Optional explicit config file path. When provided, takes
 *   precedence over registered and derived paths.
 * @returns An async handler returning `{ status, body }`.
 */
export function createConfigApplyHandler(
  descriptor: JeevesComponentDescriptor,
  configPath?: string,
): ConfigApplyHandler {
  return async (request: ConfigApplyRequest): Promise<ConfigApplyResult> => {
    const { patch, replace } = request;

    // Prefer explicit > registered > derived config path
    const resolvedConfigPath =
      configPath ??
      getComponentConfigPath(descriptor.name) ??
      join(getComponentConfigDir(descriptor.name), descriptor.configFileName);

    // Read the raw config (never the schema-parsed form)
    let existing: RawConfigFile;
    try {
      existing = readRawConfigFile(resolvedConfigPath);
    } catch (err: unknown) {
      return {
        status: 500,
        body: {
          error: `Could not read config file ${resolvedConfigPath}: ${getErrorMessage(err)}`,
        },
      };
    }

    // Merge or replace
    const mergeFn = descriptor.customMerge ?? deepMerge;
    const merged = replace ? { ...patch } : mergeFn(existing.config, patch);

    // Validate against schema
    const schema = descriptor.configSchema;
    const parseResult = schema.safeParse(merged);

    if (!parseResult.success) {
      return {
        status: 400,
        body: {
          error: 'Config validation failed',
          issues: parseResult.error.issues,
        },
      };
    }

    // Extract validated data (Zod returns unknown from ZodTypeAny)
    const validatedConfig: unknown = parseResult.data;

    // Write the merged raw object, keeping the file mode
    try {
      writeRawConfigFile(resolvedConfigPath, merged, existing.mode);
    } catch (err: unknown) {
      return {
        status: 500,
        body: { error: `Failed to write config: ${getErrorMessage(err)}` },
      };
    }

    // Call onConfigApply callback if defined
    if (descriptor.onConfigApply) {
      try {
        await descriptor.onConfigApply(
          validatedConfig as Record<string, unknown>,
        );
      } catch (err: unknown) {
        return {
          status: 200,
          body: {
            applied: true,
            warning: `Config written but callback failed: ${getErrorMessage(err)}`,
            config: validatedConfig,
          },
        };
      }
    }

    return {
      status: 200,
      body: {
        applied: true,
        config: validatedConfig,
      },
    };
  };
}
