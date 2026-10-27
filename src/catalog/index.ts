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

export { CatalogDefinitionError, defineCatalog } from './defineCatalog.js';
export { type ErrorBody, errorBodySchema } from './errorBody.js';
export { queryArray } from './queryArray.js';
export { standardEntries } from './standardEntries.js';
export type {
  AuthScheme,
  AuthSpec,
  Catalog,
  CatalogEntry,
  EntryKind,
} from './types.js';
