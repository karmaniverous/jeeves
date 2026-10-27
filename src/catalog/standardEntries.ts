/**
 * Standard catalog entries for `/status`, `/config` and `/config/apply`
 * (spec 5.2).
 *
 * @remarks
 * Their schemas describe what core's existing handlers
 * (`createStatusHandler`, `createConfigQueryHandler`,
 * `createConfigApplyHandler`) return today; type tests pin them to the
 * exported `StatusResponse` and `ConfigApplyRequest` shapes.
 *
 * @module
 */

import { z } from 'zod';

import type { AuthSpec, CatalogEntry } from './types.js';

/**
 * The `/status` response body.
 *
 * @param health - Schema for the component-specific `health` details.
 * @returns The schema.
 */
export function statusResponseSchema<H extends z.ZodType>(health: H) {
  return z.object({
    /** Component name. */
    name: z.string(),
    /** Component version. */
    version: z.string(),
    /** Seconds since process start. */
    uptime: z.number(),
    /** Overall status. */
    status: z.union([
      z.literal('healthy'),
      z.literal('degraded'),
      z.literal('unhealthy'),
    ]),
    /** Component-specific health details. */
    health,
  });
}

/** Default `health` schema: any object. */
const anyHealth = z.looseObject({});

/** `GET /config` query. */
export const configQuerySchema = z.object({
  /** JSONPath expression; omit for the full config. */
  path: z.string().optional(),
});

/**
 * `GET /config` response: the full config, or the JSONPath matches. Both
 * branches keep unknown keys, so serialising a full config that happens to
 * have `result` and `count` keys drops nothing.
 */
export const configQueryResponseSchema = z.union([
  z.looseObject({
    /** Values matching the JSONPath. */
    result: z.array(z.unknown()),
    /** Number of matches. */
    count: z.number(),
  }),
  z.looseObject({}),
]);

/** `POST /config/apply` body. */
export const configApplyBodySchema = z.object({
  /** Config patch, deep-merged into the config file. */
  patch: z.record(z.string(), z.unknown()),
  /** Replace the whole config instead of merging. */
  replace: z.boolean().optional(),
});

/** `POST /config/apply` success response. */
export const configApplyResponseSchema = z.object({
  /** The config was written. */
  applied: z.literal(true),
  /** The validated config. */
  config: z.looseObject({}),
  /** Set when the write succeeded but `onConfigApply` failed. */
  warning: z.string().optional(),
});

/**
 * The three standard entries for a component, used in place of its own
 * entries for the same routes:
 * `defineCatalog([...standardEntries(name, options), ...own])`.
 *
 * @param componentName - Component name, used in the descriptions
 *   (e.g. `watcher`).
 * @param options - `auth.config`: how the component protects `/config` and
 *   `/config/apply` (required); `auth.status`: `/status` protection
 *   (default `'none'`); `healthSchema`: the component's `health` details
 *   (default any object).
 * @returns The `status`, `config` and `configApply` entries, as a readonly
 *   tuple with literal names.
 */
export function standardEntries<H extends z.ZodType = typeof anyHealth>(
  componentName: string,
  options: {
    readonly auth: { readonly config: AuthSpec; readonly status?: AuthSpec };
    readonly healthSchema?: H;
  },
) {
  const health = (options.healthSchema ?? anyHealth) as H;
  return [
    {
      /** Entry name. */
      name: 'status',
      /** HTTP method. */
      method: 'GET',
      /** Route path. */
      path: '/status',
      /** What the endpoint does. */
      description: `Get ${componentName} service health, version, and uptime.`,
      /** Successful response. */
      response: statusResponseSchema(health),
      /** Who may call it. */
      auth: options.auth.status ?? 'none',
      /** What it does to service state. */
      kind: 'read',
    },
    {
      /** Entry name. */
      name: 'config',
      /** HTTP method. */
      method: 'GET',
      /** Route path. */
      path: '/config',
      /** What the endpoint does. */
      description: `Query ${componentName} running configuration. Optional JSONPath filter.`,
      /** Query parameters. */
      query: configQuerySchema,
      /** Successful response. */
      response: configQueryResponseSchema,
      /** Who may call it. */
      auth: options.auth.config,
      /** What it does to service state. */
      kind: 'read',
    },
    {
      /** Entry name. */
      name: 'configApply',
      /** HTTP method. */
      method: 'POST',
      /** Route path. */
      path: '/config/apply',
      /** What the endpoint does. */
      description: `Apply a config patch to the running ${componentName} service.`,
      /** Request body. */
      body: configApplyBodySchema,
      /** Successful response. */
      response: configApplyResponseSchema,
      /** Who may call it. */
      auth: options.auth.config,
      /** What it does to service state. */
      kind: 'write',
    },
  ] as const satisfies readonly CatalogEntry[];
}
