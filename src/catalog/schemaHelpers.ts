/**
 * Schema and route helpers shared by the catalog rules, the OpenAPI builder
 * and route registration.
 *
 * @remarks
 * Schemas are read through Zod's core `_zod.def`, never `instanceof`, so
 * schemas built with a component's own copy of Zod are read correctly.
 *
 * @module
 */

import type { z } from 'zod';

/** A Zod schema's core definition, as far as core reads it. */
export interface SchemaDef {
  /** Schema type (`string`, `object`, `pipe`, ...). */
  type: string;
  /** Wrapped schema, for wrappers such as `optional`. */
  innerType?: z.core.$ZodType;
  /** Input side of a pipe or codec. */
  in?: z.core.$ZodType;
  /** Set on `z.coerce.*` schemas. */
  coerce?: boolean;
  /** Enum entries. */
  entries?: Record<string, unknown>;
  /** Literal values. */
  values?: unknown[];
  /** Object shape. */
  shape?: Record<string, z.core.$ZodType>;
}

/**
 * A schema's core definition.
 *
 * @param schema - Any Zod schema.
 * @returns Its definition.
 */
export const defOf = (schema: z.core.$ZodType): SchemaDef => schema._zod.def;

/** The three request slots, in merge order. */
export const REQUEST_SLOTS = ['params', 'query', 'body'] as const;

/** One request slot. */
export type RequestSlot = (typeof REQUEST_SLOTS)[number];

/**
 * Whether a content type is JSON (`application/json` or `+json`).
 *
 * @param contentType - Content type, or undefined for the JSON default.
 * @returns True for JSON.
 */
export function isJsonContentType(contentType: string | undefined): boolean {
  return contentType === undefined || /(^|[/+])json\b/i.test(contentType);
}

/**
 * Whether a content type is text (`text/*`), returned as a string rather
 * than bytes.
 *
 * @param contentType - A non-JSON content type.
 * @returns True for `text/*`.
 */
export function isTextContentType(contentType: string): boolean {
  return contentType.startsWith('text/');
}

/**
 * Object shape of a slot schema, or undefined when it isn't an object.
 *
 * @param schema - Slot schema.
 * @returns Its shape.
 */
export function shapeOf(
  schema: z.core.$ZodType,
): Record<string, z.core.$ZodType> | undefined {
  const def = defOf(schema);
  return def.type === 'object' ? def.shape : undefined;
}

/** A `:name` path parameter segment; group 1 is the name. */
export const PATH_PARAM = /:([A-Za-z0-9_]+)/g;

/**
 * Path parameter names in a Fastify path: each `:name`, plus `*` for a
 * wildcard.
 *
 * @param path - Route path.
 * @returns Parameter names.
 */
export function pathParams(path: string): string[] {
  const names = [...path.matchAll(PATH_PARAM)].map((m) => m[1]);
  return path.includes('*') ? [...names, '*'] : names;
}
