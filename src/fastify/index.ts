/**
 * `@karmaniverous/jeeves/fastify` entry point (spec 5.1).
 *
 * @remarks
 * Catalog-driven Fastify route registration and the `/openapi.json` route.
 * Imports only types from `fastify`, an optional peer: the app supplies its
 * own Fastify instance. Request validation is core's own (spec 5a.2), so
 * nothing outside jeeves and `zod` loads at run time.
 *
 * @packageDocumentation
 */

export { registerCatalogRoutes } from './registerCatalogRoutes.js';
export { registerOpenApiRoute } from './registerOpenApiRoute.js';
export {
  type StandardCatalogHandlers,
  standardHandlers,
  type StandardHandlerSources,
} from './standardHandlers.js';
export type {
  CatalogHandler,
  CatalogHandlers,
  CatalogRouteLogger,
  CatalogValidationIssue,
  ErrorStatus,
  HandlerResult,
  RegisterCatalogRoutesOptions,
  RequestInput,
  ResponseHeaders,
  SlotValue,
  SuccessStatus,
} from './types.js';
