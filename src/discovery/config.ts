/**
 * Core configuration schema and resolution.
 *
 * @remarks
 * Core config lives at `{configRoot}/jeeves-core/config.json`.
 * Config resolution order:
 * 1. Component's own config file
 * 2. Core config file
 * 3. Hardcoded library defaults
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { CONFIG_FILE } from '../constants/paths.js';

/** Zod schema for a service entry in core config. */
const serviceEntrySchema = z.object({
  /** Service URL (must be a valid URL). */
  url: z.string().url().describe('Service URL'),
});

/** Zod schema for the core config file. */
export const coreConfigSchema = z.object({
  /** JSON Schema pointer for IDE autocomplete. */
  $schema: z.string().optional().describe('JSON Schema pointer'),
  /** Owner identity keys (canonical identityLinks references). */
  owners: z.array(z.string()).default([]).describe('Owner identity keys'),
  /** Service URL overrides keyed by service name. */
  services: z
    .record(z.string(), serviceEntrySchema)
    .default({})
    .describe('Service URL overrides'),
  /** Registry cache configuration. */
  registryCache: z
    .object({
      /** Cache TTL in seconds for npm registry queries. */
      ttlSeconds: z
        .number()
        .int()
        .positive()
        .default(3600)
        .describe('Cache TTL in seconds'),
    })
    .default({})
    .describe('Registry cache settings'),
});

/** Core config type derived from the Zod schema. */
export type CoreConfig = z.infer<typeof coreConfigSchema>;

/**
 * Generate a JSON Schema from the Zod schema for `$schema` pointer support.
 *
 * @returns A JSON Schema object.
 */
export function generateJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Jeeves Core Configuration',
    type: 'object',
    properties: {
      $schema: { type: 'string' },
      owners: {
        type: 'array',
        items: { type: 'string' },
        default: [],
      },
      services: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
          },
          required: ['url'],
        },
        default: {},
      },
      registryCache: {
        type: 'object',
        properties: {
          ttlSeconds: {
            type: 'integer',
            minimum: 1,
            default: 3600,
          },
        },
        default: {},
      },
    },
  };
}

/**
 * Load and parse a config file, returning undefined if missing or invalid.
 *
 * @param configDir - Directory containing config.json.
 * @returns Parsed config or undefined.
 */
export function loadConfig(configDir: string): CoreConfig | undefined {
  const configPath = join(configDir, CONFIG_FILE);
  if (!existsSync(configPath)) return undefined;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return coreConfigSchema.parse(parsed);
  } catch {
    return undefined;
  }
}
