/**
 * `@karmaniverous/jeeves/fastify` entry point (spec 5.1).
 *
 * @remarks
 * Catalog-driven Fastify route registration, Fastify's standard error body
 * for every error (spec 5c), and the `/openapi.json` route. Imports only
 * types from `fastify`, an optional peer: the app supplies its own Fastify
 * instance. Request validation is core's own (spec 5a.2), so nothing outside
 * jeeves and `zod` loads at run time.
 *
 * @packageDocumentation
 */

export {
  errorBody,
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from '../api/errorBody.js';
export { registerErrorHandlers } from './errorHandler.js';
export { registerCatalogRoutes } from './registerCatalogRoutes.js';
export { registerOpenApiRoute } from './registerOpenApiRoute.js';
export {
  type StandardCatalogHandlers,
  standardHandlers,
  type StandardHandlersOptions,
  type StandardHandlerSources,
} from './standardHandlers.js';
export type {
  CatalogHandler,
  CatalogHandlers,
  CatalogRouteLogger,
  ErrorStatus,
  HandlerErrorBody,
  HandlerResult,
  RegisterCatalogRoutesOptions,
  RegisterErrorHandlersOptions,
  RequestInput,
  ResponseHeaders,
  SlotValue,
  SuccessStatus,
} from './types.js';
