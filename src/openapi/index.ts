/**
 * `@karmaniverous/jeeves/openapi` entry point (spec 5.1).
 *
 * @remarks
 * OpenAPI 3.1 document building from a catalog, the committed-document
 * writer and the drift check. Needs the optional peer `zod-openapi`; never
 * imports Fastify.
 *
 * @packageDocumentation
 */

export {
  buildOpenApiDocument,
  type OpenApiDocument,
  type OpenApiInfo,
} from './buildOpenApiDocument.js';
export {
  checkOpenApiDrift,
  type OpenApiDriftResult,
  writeOpenApiDocument,
} from './writeOpenApiDocument.js';
