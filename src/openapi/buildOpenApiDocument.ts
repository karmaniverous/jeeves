/**
 * OpenAPI 3.1 document building from a catalog (spec 5.6).
 *
 * @module
 */

import {
  createDocument,
  type ZodOpenApiContentObject,
  type ZodOpenApiObject,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
} from 'zod-openapi';

import { errorBodySchema } from '../catalog/errorBody.js';
import {
  isJsonContentType,
  isTextContentType,
  PATH_PARAM,
} from '../catalog/schemaHelpers.js';
import type {
  AuthScheme,
  AuthSpec,
  Catalog,
  CatalogEntry,
} from '../catalog/types.js';

/** Document `info`. */
export interface OpenApiInfo {
  /** API title. */
  title: string;
  /** API version (normally the component's package version). */
  version: string;
  /** Optional description. */
  description?: string;
}

/** A generated OpenAPI 3.1 document. */
export type OpenApiDocument = ReturnType<typeof createDocument>;

/** Security scheme objects, as written to `components.securitySchemes`. */
type SecuritySchemeObject =
  | { type: 'http'; scheme: 'bearer' }
  | { type: 'apiKey'; in: 'header' | 'query' | 'cookie'; name: string };

/**
 * The `components.securitySchemes` key for a scheme: `bearer`, or
 * `<in>_<name>` with non-identifier characters replaced by `_`.
 *
 * @param scheme - Credential scheme.
 * @returns Its key.
 */
export function securitySchemeKey(scheme: AuthScheme): string {
  return scheme.in === 'bearer'
    ? 'bearer'
    : `${scheme.in}_${scheme.name.replace(/[^A-Za-z0-9_]/g, '_')}`;
}

/**
 * The security scheme object for a scheme.
 *
 * @param scheme - Credential scheme.
 * @returns The OpenAPI security scheme.
 */
function securitySchemeObject(scheme: AuthScheme): SecuritySchemeObject {
  return scheme.in === 'bearer'
    ? { type: 'http', scheme: 'bearer' }
    : { type: 'apiKey', in: scheme.in, name: scheme.name };
}

/**
 * The operation `security` for an entry: none for `'none'`, otherwise one
 * alternative per scheme.
 *
 * @param auth - Entry auth.
 * @returns Security requirements.
 */
function securityOf(auth: AuthSpec): Record<string, string[]>[] {
  return auth === 'none'
    ? []
    : auth.schemes.map((s) => ({ [securitySchemeKey(s)]: [] }));
}

/**
 * Fastify path to OpenAPI path: `:id` becomes `{id}`, `*` becomes `{*}`.
 *
 * @param path - Fastify route path.
 * @returns OpenAPI path template.
 */
export function toOpenApiPath(path: string): string {
  return path.replace(PATH_PARAM, '{$1}').replace('*', '{*}');
}

/**
 * The success response content for an entry.
 *
 * @param entry - Catalog entry.
 * @returns The `content` map.
 */
function successContent(entry: CatalogEntry): ZodOpenApiContentObject {
  if (isJsonContentType(entry.contentType))
    return {
      [entry.contentType ?? 'application/json']: { schema: entry.response },
    };
  const contentType = entry.contentType as string;
  return {
    [contentType]: {
      schema: isTextContentType(contentType)
        ? { type: 'string' }
        : { type: 'string', format: 'binary' },
    },
  };
}

/**
 * One operation per entry.
 *
 * @param entry - Catalog entry.
 * @returns The operation.
 */
function operationOf(entry: CatalogEntry): ZodOpenApiOperationObject {
  const operation: ZodOpenApiOperationObject & {
    'x-jeeves-insider-only'?: true;
  } = {
    operationId: entry.name,
    description: entry.description,
    security: securityOf(entry.auth),
    responses: {
      200: { description: 'Success', content: successContent(entry) },
      default: {
        description: 'Error',
        content: { 'application/json': { schema: errorBodySchema } },
      },
    },
  };
  if (entry.params || entry.query)
    operation.requestParams = {
      ...(entry.params ? { path: entry.params } : {}),
      ...(entry.query ? { query: entry.query } : {}),
    };
  if (entry.body)
    operation.requestBody = {
      content: { 'application/json': { schema: entry.body } },
    };
  if (entry.auth !== 'none' && entry.auth.insiderOnly)
    operation['x-jeeves-insider-only'] = true;
  return operation;
}

/**
 * Build the OpenAPI 3.1 document for a catalog.
 *
 * @remarks
 * Request parameters and bodies are converted in input mode (the wire
 * shape) and responses in output mode; non-JSON responses are written as
 * binary or text content directly. Every operation has a default error
 * response referencing the shared `ErrorBody` component.
 *
 * @param catalog - The catalog.
 * @param info - Document `info`.
 * @returns The document.
 */
export function buildOpenApiDocument(
  catalog: Catalog,
  info: OpenApiInfo,
): OpenApiDocument {
  const paths: ZodOpenApiPathsObject = {};
  const securitySchemes: Record<string, SecuritySchemeObject> = {};
  for (const entry of catalog.entries) {
    const path = toOpenApiPath(entry.path);
    paths[path] = {
      ...paths[path],
      [entry.method.toLowerCase()]: operationOf(entry),
    };
    if (entry.auth !== 'none')
      for (const scheme of entry.auth.schemes)
        securitySchemes[securitySchemeKey(scheme)] =
          securitySchemeObject(scheme);
  }
  const document: ZodOpenApiObject = {
    openapi: '3.1.0',
    info: { ...info },
    paths,
    components: {
      schemas: { ErrorBody: errorBodySchema },
      // zod-openapi drops an empty securitySchemes map.
      securitySchemes,
    },
  };
  return createDocument(document);
}
