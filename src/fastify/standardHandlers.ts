/**
 * Adapters fitting core's existing standard handlers to catalog handlers
 * (spec 5.5).
 *
 * @module
 */

import type { ConfigApplyHandler } from '../api/configApplyHandler.js';
import type { ConfigQueryHandler } from '../api/configQuery.js';
import type { StatusHandler } from '../api/statusHandler.js';
import type { CatalogEntry } from '../catalog/types.js';
import type {
  CatalogHandler,
  HandlerResult,
  RegisterErrorHandlersOptions,
} from './types.js';

/** Core's existing standard handlers. */
export interface StandardHandlerSources {
  /** From `createStatusHandler`. */
  status: StatusHandler;
  /** From `createConfigQueryHandler`. */
  config: ConfigQueryHandler;
  /** From `createConfigApplyHandler`. */
  configApply: ConfigApplyHandler;
}

/**
 * Options for `standardHandlers`: `logger`, where status and config apply
 * log their failures (only `error` is called; default the request's Fastify
 * logger). The same shape as `registerErrorHandlers`' options, so one object
 * can be passed to both.
 */
export type StandardHandlersOptions = RegisterErrorHandlersOptions;

/** Catalog handlers for the three `standardEntries`. */
export interface StandardCatalogHandlers {
  /** `GET /status`. */
  status: CatalogHandler<CatalogEntry>;
  /** `GET /config`. */
  config: CatalogHandler<CatalogEntry>;
  /** `POST /config/apply`. */
  configApply: CatalogHandler<CatalogEntry>;
}

/**
 * A `{ status, body }` result from an existing handler, as a handler result.
 * The existing handlers return 2xx with the entry's response or 4xx/5xx with
 * Fastify's error body; route registration validates a 2xx body against the
 * entry's schema and rebuilds an error body from its status, `message` and
 * `code`.
 *
 * @param result - Existing handler result.
 * @returns The same result, typed for any entry.
 */
const asResult = (result: {
  status: number;
  body: unknown;
}): HandlerResult<CatalogEntry> => result as HandlerResult<CatalogEntry>;

/**
 * Catalog handlers for the three `standardEntries`, from core's existing
 * handlers: spread them into the handlers passed to `registerCatalogRoutes`.
 *
 * @remarks
 * Config apply's failures and warning, and status's `health.error` when the
 * health check throws, are caller-facing text only; the underlying error
 * (and the config file path) is logged to `options.logger`, else the
 * request's Fastify logger (spec 5d.2, 5d.3). Pass the same `logger` as to
 * `registerCatalogRoutes` when the app was created with `logger: false`.
 *
 * @param sources - The existing status, config query and config apply
 *   handlers.
 * @param options - Where status and config apply log their failures (only
 *   `error` is called). Default: the request's Fastify logger.
 * @returns Handlers keyed `status`, `config` and `configApply`.
 */
export function standardHandlers(
  sources: StandardHandlerSources,
  options: StandardHandlersOptions = {},
): StandardCatalogHandlers {
  return {
    status: async (_input, request) =>
      asResult(await sources.status(options.logger ?? request.log)),
    config: async ({ query }) =>
      asResult(
        await sources.config({ path: (query as { path?: string }).path }),
      ),
    configApply: async ({ body }, request) =>
      asResult(
        await sources.configApply(
          body as unknown as Parameters<ConfigApplyHandler>[0],
          options.logger ?? request.log,
        ),
      ),
  };
}
