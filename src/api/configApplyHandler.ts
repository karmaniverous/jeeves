/**
 * Factory for a framework-agnostic config apply HTTP handler.
 *
 * @remarks
 * Derives the config file path from the descriptor, validates patches
 * against the descriptor's Zod schema, deep-merges (or replaces),
 * writes atomically, and calls the optional `onConfigApply` callback.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { getComponentConfigDir } from '../init.js';
import { atomicWrite } from '../managed/fileOps.js';

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

/**
 * Read and parse a JSON config file.
 *
 * @param filePath - Absolute path to the file.
 * @returns Parsed object or empty object if not found.
 */
function readConfigFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`jeeves-core: Could not read config file ${filePath}: ${msg}`);
    return {};
  }
}

/**
 * Create a framework-agnostic config apply handler.
 *
 * @remarks
 * The handler:
 * 1. Reads existing config from `{configRoot}/jeeves-{name}/{configFileName}`
 * 2. Deep-merges the patch (or replaces if `replace: true`)
 * 3. Validates the merged result against `descriptor.configSchema`
 * 4. Writes atomically
 * 5. Calls `descriptor.onConfigApply` with the merged config (if defined)
 *
 * @param descriptor - The component descriptor.
 * @returns An async handler returning `{ status, body }`.
 */
export function createConfigApplyHandler(
  descriptor: JeevesComponentDescriptor,
): ConfigApplyHandler {
  return async (request: ConfigApplyRequest): Promise<ConfigApplyResult> => {
    const { patch, replace } = request;

    // Derive config path
    const configDir = getComponentConfigDir(descriptor.name);
    const configPath = join(configDir, descriptor.configFileName);

    // Read existing config
    const existing = readConfigFile(configPath);

    // Merge or replace
    const merged = replace ? { ...patch } : deepMerge(existing, patch);

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

    // Write atomically
    try {
      const json = JSON.stringify(validatedConfig, null, 2) + '\n';
      atomicWrite(configPath, json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 500,
        body: { error: `Failed to write config: ${message}` },
      };
    }

    // Call onConfigApply callback if defined
    if (descriptor.onConfigApply) {
      try {
        await descriptor.onConfigApply(
          validatedConfig as Record<string, unknown>,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          status: 200,
          body: {
            applied: true,
            warning: `Config written but callback failed: ${message}`,
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
