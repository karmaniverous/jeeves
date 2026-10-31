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
import type { CatalogHandler, HandlerResult } from './types.js';

/** Core's existing standard handlers. */
export interface StandardHandlerSources {
  /** From `createStatusHandler`. */
  status: StatusHandler;
  /** From `createConfigQueryHandler`. */
  config: ConfigQueryHandler;
  /** From `createConfigApplyHandler`. */
  configApply: ConfigApplyHandler;
}

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
 * `{ error }`; route registration validates the body against the status's
 * schema either way.
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
 * @param sources - The existing status, config query and config apply
 *   handlers.
 * @returns Handlers keyed `status`, `config` and `configApply`.
 */
export function standardHandlers(
  sources: StandardHandlerSources,
): StandardCatalogHandlers {
  return {
    status: async () => asResult(await sources.status()),
    config: async ({ query }) =>
      asResult(
        await sources.config({ path: (query as { path?: string }).path }),
      ),
    configApply: async ({ body }) =>
      asResult(
        await sources.configApply(
          body as unknown as Parameters<ConfigApplyHandler>[0],
        ),
      ),
  };
}
