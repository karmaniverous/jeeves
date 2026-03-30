/**
 * Zod schema for the Jeeves component descriptor.
 *
 * @remarks
 * The descriptor replaces the v0.4.0 `JeevesComponent` interface with a
 * Zod-first approach. The TypeScript type is inferred via `z.infer<>`.
 * Validates at parse time: prime interval, callable functions.
 */

import type { Command } from '@commander-js/extra-typings';
import { z, type ZodType } from 'zod';

import type { PluginApi } from '../plugin/types.js';

/**
 * Check whether a number is prime.
 *
 * @param n - Number to check.
 * @returns `true` if n is prime.
 */
export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/**
 * Zod schema for the Jeeves component descriptor.
 *
 * @remarks
 * Single source of truth for what a component must provide.
 * Factories consume this descriptor to produce CLI commands,
 * plugin tools, and HTTP handlers.
 */
export const jeevesComponentDescriptorSchema = z.object({
  /** Component name (e.g., 'watcher', 'runner', 'server', 'meta'). */
  name: z.string().min(1, 'name must be a non-empty string'),

  /** Component version (from package.json). */
  version: z.string().min(1, 'version must be a non-empty string'),

  /** npm package name for the service. */
  servicePackage: z.string().min(1),

  /** npm package name for the plugin. */
  pluginPackage: z.string().min(1),

  /** System service name. Defaults to `jeeves-${name}` when not provided. */
  serviceName: z.string().min(1).optional(),

  /** Default port for the service's HTTP API. */
  defaultPort: z.number().int().positive(),

  /** Zod schema for validating config files. */
  configSchema: z.custom<ZodType>(
    (val) =>
      val !== null &&
      typeof val === 'object' &&
      typeof (val as ZodType).parse === 'function',
    { message: 'configSchema must be a Zod schema' },
  ),

  /** Config file name (e.g., 'jeeves-watcher.config.json'). */
  configFileName: z.string().min(1),

  /** Returns a default config object for `init`. */
  initTemplate: z.function({
    input: [],
    output: z.record(z.string(), z.unknown()),
  }),

  /**
   * Service-side callback after config apply. Receives the merged,
   * validated config (not the raw patch). Optional — if omitted,
   * write-only (service picks up changes on restart).
   */
  onConfigApply: z
    .function({
      input: [z.record(z.string(), z.unknown())],
      output: z.promise(z.void()),
    })
    .optional(),

  /**
   * Custom merge function for config apply. Receives the existing config
   * and the patch, returns the merged result. Optional — if omitted,
   * the default deep-merge (object-recursive, array-replacing) is used.
   *
   * Use this to implement domain-specific merge strategies such as
   * name-based array merging for inference rules.
   */
  customMerge: z
    .function({
      input: [
        z.record(z.string(), z.unknown()),
        z.record(z.string(), z.unknown()),
      ],
      output: z.record(z.string(), z.unknown()),
    })
    .optional(),

  /**
   * Returns command + args for launching the service process.
   * Consumed by `service install`.
   */
  startCommand: z.function({
    input: [z.string()],
    output: z.array(z.string()),
  }),

  /** In-process service entry point for the CLI `start` command. */
  run: z.function({
    input: [z.string()],
    output: z.promise(z.void()),
  }),

  /** TOOLS.md section name (e.g., 'Watcher'). */
  sectionId: z.string().min(1, 'sectionId must be a non-empty string'),

  /** Refresh interval in seconds (must be a prime number). */
  refreshIntervalSeconds: z.number().int().positive().refine(isPrime, {
    message: 'refreshIntervalSeconds must be a prime number',
  }),

  /** Produce the component's TOOLS.md section content. */
  generateToolsContent: z.function({ input: [], output: z.string() }),

  /** Component dependencies for HEARTBEAT alert suppression. */
  dependencies: z
    .object({
      /** Components that must be healthy for this component to function. */
      hard: z.array(z.string()),
      /** Components that improve behavior but are not strictly required. */
      soft: z.array(z.string()),
    })
    .optional(),

  /** Extension point: add custom CLI commands to the service CLI. */
  customCliCommands: z
    .function({ input: [z.custom<Command>()], output: z.void() })
    .optional(),

  /** Extension point: return additional plugin tool descriptors. */
  customPluginTools: z
    .function({ input: [z.custom<PluginApi>()], output: z.array(z.unknown()) })
    .optional(),
});

/** Inferred TypeScript type for the component descriptor. */
export type JeevesComponentDescriptor = z.infer<
  typeof jeevesComponentDescriptorSchema
>;

/**
 * Derive the effective service name from a descriptor.
 *
 * @param descriptor - The component descriptor.
 * @returns The service name (explicit or derived from `jeeves-{name}`).
 */
export function getEffectiveServiceName(
  descriptor: JeevesComponentDescriptor,
): string {
  return descriptor.serviceName ?? `jeeves-${descriptor.name}`;
}
