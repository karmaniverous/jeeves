/**
 * The catalog definition rules (spec 5.2, rules 1-8).
 *
 * @remarks
 * Each check returns violation messages, empty when the entry passes.
 * Schemas are inspected through Zod's core `_zod.def`, never `instanceof`,
 * so schemas built with a component's own copy of Zod are read correctly.
 *
 * @module
 */

import { z } from 'zod';

import { isQueryArray, queryArrayItem } from './queryArray.js';
import type { CatalogEntry } from './types.js';

/** A Zod schema's core definition, as far as these rules read it. */
interface Def {
  type: string;
  innerType?: z.core.$ZodType;
  in?: z.core.$ZodType;
  coerce?: boolean;
  entries?: Record<string, unknown>;
  values?: unknown[];
  shape?: Record<string, z.core.$ZodType>;
}

/**
 * A schema's core definition.
 *
 * @param schema - Any Zod schema.
 * @returns Its definition.
 */
const defOf = (schema: z.core.$ZodType): Def => schema._zod.def;

/** Wrappers that don't change what a query value must look like. */
const WRAPPERS = new Set([
  'optional',
  'default',
  'prefault',
  'nullable',
  'nonoptional',
  'readonly',
  'catch',
]);

/** The three request slots, in merge order. */
export const REQUEST_SLOTS = ['params', 'query', 'body'] as const;

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

/**
 * Rule 6: whether a query field accepts string input.
 *
 * @param schema - Query field schema.
 * @returns True when Fastify's string (or string-array) value can satisfy it.
 */
export function acceptsQueryString(schema: z.core.$ZodType): boolean {
  if (isQueryArray(schema)) return acceptsQueryString(queryArrayItem(schema));
  const def = defOf(schema);
  if (WRAPPERS.has(def.type) && def.innerType)
    return acceptsQueryString(def.innerType);
  if (def.type === 'pipe' && def.in) return acceptsQueryString(def.in);
  if (def.type === 'string' || def.type === 'template_literal') return true;
  if (def.type === 'enum')
    return Object.values(def.entries ?? {}).every((v) => typeof v === 'string');
  if (def.type === 'literal')
    return (def.values ?? []).every((v) => typeof v === 'string');
  if (['number', 'bigint', 'boolean', 'date'].includes(def.type))
    return def.coerce === true;
  return false;
}

/**
 * Whether a schema converts to JSON Schema in the given mode.
 *
 * @param schema - Schema.
 * @param io - `input` (wire shape) or `output` (parsed shape).
 * @returns True when conversion succeeds.
 */
function converts(schema: z.core.$ZodType, io: 'input' | 'output'): boolean {
  try {
    z.toJSONSchema(schema, { io, unrepresentable: 'throw' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Path parameter names in a Fastify path: each `:name`, plus `*` for a
 * wildcard.
 *
 * @param path - Route path.
 * @returns Parameter names.
 */
export function pathParams(path: string): string[] {
  const names = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  return path.includes('*') ? [...names, '*'] : names;
}

/**
 * Rules 3-8 for one entry.
 *
 * @param entry - The entry.
 * @returns Violation messages.
 */
export function checkEntry(entry: CatalogEntry): string[] {
  const out: string[] = [];
  const at = `entry "${entry.name}"`;

  if (!/^[a-z][a-zA-Z0-9]*$/.test(entry.name))
    out.push(`${at}: name must be camelCase (^[a-z][a-zA-Z0-9]*$)`);

  // Rule 3: object slots.
  const shapes: Partial<
    Record<(typeof REQUEST_SLOTS)[number], Record<string, z.core.$ZodType>>
  > = {};
  for (const slot of REQUEST_SLOTS) {
    const schema = entry[slot];
    if (!schema) continue;
    const shape = shapeOf(schema);
    if (shape) shapes[slot] = shape;
    else out.push(`${at}: ${slot} must be a Zod object`);
  }

  // Rule 4: no field in more than one slot.
  const seen = new Map<string, string>();
  for (const slot of REQUEST_SLOTS) {
    for (const field of Object.keys(shapes[slot] ?? {})) {
      const first = seen.get(field);
      if (first)
        out.push(
          `${at}: field "${field}" appears in both ${first} and ${slot}`,
        );
      else seen.set(field, slot);
    }
  }

  // Rule 5: params keys equal the path's parameters.
  const expected = [...pathParams(entry.path)].sort();
  const actual = Object.keys(shapes.params ?? {}).sort();
  if (expected.join('\0') !== actual.join('\0'))
    out.push(
      `${at}: params keys [${actual.join(', ')}] must equal the path parameters [${expected.join(', ')}]`,
    );

  // Rule 6: query fields accept strings.
  for (const [field, schema] of Object.entries(shapes.query ?? {}))
    if (!acceptsQueryString(schema))
      out.push(
        `${at}: query field "${field}" must accept string input (string, string enum or literal, z.coerce.*, z.stringbool() or queryArray(...))`,
      );

  // Rule 7: request schemas convert both ways; JSON responses as output.
  for (const slot of REQUEST_SLOTS) {
    const schema = entry[slot];
    if (!schema || !shapes[slot]) continue;
    for (const io of ['input', 'output'] as const)
      if (!converts(schema, io))
        out.push(`${at}: ${slot} does not convert to JSON Schema (io: ${io})`);
  }
  const json = isJsonContentType(entry.contentType);
  if (json && !converts(entry.response, 'output'))
    out.push(`${at}: response does not convert to JSON Schema (io: output)`);

  // Rule 8: non-JSON responses are bytes or text.
  if (!json) {
    const def = defOf(entry.response);
    const bytes =
      def.type === 'custom' &&
      entry.response.safeParse(new Uint8Array()).success;
    if (def.type !== 'string' && !bytes)
      out.push(
        `${at}: a non-JSON response must be z.instanceof(Uint8Array) or z.string()`,
      );
  }

  return out;
}

/**
 * Rules 1-2 across entries: unique names and unique method + path pairs.
 *
 * @param entries - All entries.
 * @returns Violation messages.
 */
export function checkUniqueness(entries: readonly CatalogEntry[]): string[] {
  const out: string[] = [];
  const names = new Set<string>();
  const routes = new Map<string, string>();
  for (const entry of entries) {
    if (names.has(entry.name))
      out.push(`entry "${entry.name}": duplicate name`);
    names.add(entry.name);
    const route = `${entry.method} ${entry.path}`;
    const other = routes.get(route);
    if (other)
      out.push(
        `entry "${entry.name}": duplicate route ${route} (also "${other}")`,
      );
    else routes.set(route, entry.name);
  }
  return out;
}
