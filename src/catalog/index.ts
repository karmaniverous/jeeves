/**
 * `@karmaniverous/jeeves/catalog` entry point (spec 5.1).
 *
 * @remarks
 * Endpoint catalog model, request building, transports, the typed client and
 * the shared tool definition. Depends only on `zod`, so SDK and plugin
 * packages can import it without Fastify.
 *
 * @packageDocumentation
 */

export {
  buildCatalogRequest,
  type CatalogInput,
  type CatalogRequest,
  type SlotInput,
} from './buildCatalogRequest.js';
export {
  type CatalogToolAnnotations,
  type CatalogToolDefinition,
  catalogToolDefinition,
  type CatalogToolOptions,
  toolInputToRequest,
  toolResultFromResponse,
  toToolName,
} from './catalogTool.js';
export {
  CatalogClientError,
  type CatalogClientErrorDetails,
} from './clientError.js';
export {
  type CatalogClient,
  type CatalogClientOptions,
  type ClientAuth,
  type ClientResponse,
  createCatalogClient,
  type Secret,
} from './createCatalogClient.js';
export { CatalogDefinitionError, defineCatalog } from './defineCatalog.js';
export { type ErrorBody, errorBodySchema } from './errorBody.js';
export {
  type CatalogResponse,
  type CatalogTransport,
  httpTransport,
  type HttpTransportOptions,
} from './httpTransport.js';
export { queryArray } from './queryArray.js';
export { standardEntries } from './standardEntries.js';
export type {
  AuthScheme,
  AuthSpec,
  Catalog,
  CatalogEntry,
  EntryKind,
  IsJsonEntry,
} from './types.js';
