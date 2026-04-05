/**
 * Workspace-level shared configuration: `jeeves.config.json`.
 *
 * @remarks
 * Lives at the OpenClaw workspace root alongside TOOLS.md and SOUL.md.
 * Provides namespaced shared defaults consumed by the root Jeeves CLI.
 * Resolution precedence: CLI flags → env vars → jeeves.config.json → defaults.
 *
 * This does not replace component-owned config schemas (Decision 41).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { getErrorMessage } from '../utils.js';

/** Workspace config file name. */
export const WORKSPACE_CONFIG_FILE = 'jeeves.config.json';

/** Core shared config section. */
const workspaceCoreConfigSchema = z
  .object({
    /** Workspace root path. */
    workspace: z.string().optional().describe('Workspace root path'),
    /** Platform config root path. */
    configRoot: z.string().optional().describe('Platform config root path'),
    /** OpenClaw gateway URL. */
    gatewayUrl: z.string().optional().describe('OpenClaw gateway URL'),
  })
  .partial();

/** Memory shared config section. */
const workspaceMemoryConfigSchema = z
  .object({
    /** MEMORY.md character budget. */
    budget: z.number().int().positive().optional().describe('Memory budget'),
    /** Warning threshold as a fraction of budget. */
    warningThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Memory warning threshold'),
    /** Staleness threshold in days. */
    staleDays: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Memory staleness threshold in days'),
  })
  .partial();

/** Workspace config Zod schema. */
export const workspaceConfigSchema = z.object({
  /** JSON Schema pointer for IDE autocomplete. */
  $schema: z.string().optional().describe('JSON Schema pointer'),
  /** Core shared defaults. */
  core: workspaceCoreConfigSchema.optional(),
  /** Memory hygiene shared defaults. */
  memory: workspaceMemoryConfigSchema.optional(),
});

/** Workspace config type. */
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

/**
 * Built-in workspace config defaults.
 *
 * @remarks
 * These defaults are used as the lowest-priority tier in config resolution
 * (below CLI flags, env vars, and `jeeves.config.json` values).
 */
export const WORKSPACE_CONFIG_DEFAULTS: {
  /** Core shared defaults. */
  readonly core: {
    /** Default workspace root path. */
    readonly workspace: '.';
    /** Default platform config root path. */
    readonly configRoot: './config';
    /** Default OpenClaw gateway URL. */
    readonly gatewayUrl: 'http://127.0.0.1:3000';
  };
  /** Memory hygiene shared defaults. */
  readonly memory: {
    /** Default MEMORY.md character budget. */
    readonly budget: 20_000;
    /** Default warning threshold as a fraction of budget (80%). */
    readonly warningThreshold: 0.8;
    /** Default staleness threshold in days. */
    readonly staleDays: 30;
  };
} = {
  core: {
    workspace: '.',
    configRoot: './config',
    gatewayUrl: 'http://127.0.0.1:3000',
  },
  memory: {
    budget: 20_000,
    warningThreshold: 0.8,
    staleDays: 30,
  },
};

/** Provenance source for a resolved config value. */
export type ConfigProvenance = 'flag' | 'env' | 'file' | 'default';

/** A resolved config value with provenance. */
export interface ResolvedValue<T> {
  /** The resolved value. */
  value: T;
  /** Where the value came from. */
  provenance: ConfigProvenance;
}

/**
 * Load workspace config from `jeeves.config.json` at a given path.
 *
 * @param workspacePath - Workspace root directory.
 * @returns Parsed config or undefined if missing or invalid.
 */
export function loadWorkspaceConfig(
  workspacePath: string,
): WorkspaceConfig | undefined {
  const configPath = join(workspacePath, WORKSPACE_CONFIG_FILE);
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return workspaceConfigSchema.parse(parsed);
  } catch (err: unknown) {
    console.warn(
      `jeeves-core: failed to load ${configPath}: ${getErrorMessage(err)}`,
    );
    return undefined;
  }
}

/**
 * Resolve a config value with four-tier precedence.
 *
 * @param flagValue - CLI flag value (highest priority).
 * @param envValue - Environment variable value.
 * @param fileValue - Value from jeeves.config.json.
 * @param defaultValue - Built-in default (lowest priority).
 * @returns The resolved value with provenance annotation.
 */
export function resolveConfigValue<T>(
  flagValue: T | undefined,
  envValue: T | undefined,
  fileValue: T | undefined,
  defaultValue: T,
): ResolvedValue<T> {
  if (flagValue !== undefined) return { value: flagValue, provenance: 'flag' };
  if (envValue !== undefined) return { value: envValue, provenance: 'env' };
  if (fileValue !== undefined) return { value: fileValue, provenance: 'file' };
  return { value: defaultValue, provenance: 'default' };
}

/**
 * Generate a JSON Schema for the workspace config.
 *
 * @returns A JSON Schema object.
 */
export function generateWorkspaceJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Jeeves Workspace Configuration',
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      core: {
        type: 'object',
        properties: {
          workspace: {
            type: 'string',
            default: WORKSPACE_CONFIG_DEFAULTS.core.workspace,
          },
          configRoot: {
            type: 'string',
            default: WORKSPACE_CONFIG_DEFAULTS.core.configRoot,
          },
          gatewayUrl: {
            type: 'string',
            default: WORKSPACE_CONFIG_DEFAULTS.core.gatewayUrl,
          },
        },
      },
      memory: {
        type: 'object',
        properties: {
          budget: {
            type: 'integer',
            minimum: 1,
            default: WORKSPACE_CONFIG_DEFAULTS.memory.budget,
          },
          warningThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            default: WORKSPACE_CONFIG_DEFAULTS.memory.warningThreshold,
          },
          staleDays: {
            type: 'integer',
            minimum: 1,
            default: WORKSPACE_CONFIG_DEFAULTS.memory.staleDays,
          },
        },
      },
    },
  };
}
