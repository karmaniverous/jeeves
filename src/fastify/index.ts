/**
 * `@karmaniverous/jeeves/fastify` entry point (spec 5.1).
 *
 * @remarks
 * Catalog-driven Fastify route registration and the `/openapi.json` route.
 * Needs the optional peers `fastify` and `fastify-type-provider-zod`.
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
