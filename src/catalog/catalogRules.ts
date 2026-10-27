/**
 * The catalog definition rules (spec 5.2, rules 1-8).
 *
 * @remarks
 * One function per rule, each returning violation messages (empty when the
 * entry passes); {@link checkEntry} and {@link checkUniqueness} combine them.
 *
 * @module
 */

import { z } from 'zod';

import { isQueryArray, queryArrayItem } from './queryArray.js';
import {
  defOf,
  isJsonContentType,
  pathParams,
  REQUEST_SLOTS,
  type RequestSlot,
  shapeOf,
} from './schemaHelpers.js';
import type { CatalogEntry } from './types.js';

/** Object shapes of an entry's request slots that are objects. */
type SlotShapes = Partial<Record<RequestSlot, Record<string, z.core.$ZodType>>>;

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

/**
 * Rule 6 predicate: whether a query field accepts string input.
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
 * Rule 1 (per entry): camelCase name.
 *
 * @param entry - The entry.
 * @returns Violations, without the entry prefix.
 */
function checkName(entry: CatalogEntry): string[] {
  return /^[a-z][a-zA-Z0-9]*$/.test(entry.name)
    ? []
    : ['name must be camelCase (^[a-z][a-zA-Z0-9]*$)'];
}

/**
 * Rule 3: request slots are Zod objects.
 *
 * @param entry - The entry.
 * @returns The object shapes found, and violations.
 */
function checkObjectSlots(entry: CatalogEntry): {
  shapes: SlotShapes;
  violations: string[];
} {
  const shapes: SlotShapes = {};
  const violations: string[] = [];
  for (const slot of REQUEST_SLOTS) {
    const schema = entry[slot];
    if (!schema) continue;
    const shape = shapeOf(schema);
    if (shape) shapes[slot] = shape;
    else violations.push(`${slot} must be a Zod object`);
  }
  return { shapes, violations };
}

/**
 * Rule 4: no field in more than one slot.
 *
 * @param shapes - Slot shapes.
 * @returns Violations.
 */
function checkFieldCollisions(shapes: SlotShapes): string[] {
  const violations: string[] = [];
  const seen = new Map<string, string>();
  for (const slot of REQUEST_SLOTS) {
    for (const field of Object.keys(shapes[slot] ?? {})) {
      const first = seen.get(field);
      if (first)
        violations.push(
          `field "${field}" appears in both ${first} and ${slot}`,
        );
      else seen.set(field, slot);
    }
  }
  return violations;
}

/**
 * Rule 5: `params` keys equal the path's parameters.
 *
 * @param entry - The entry.
 * @param shapes - Slot shapes.
 * @returns Violations.
 */
function checkPathParams(entry: CatalogEntry, shapes: SlotShapes): string[] {
  const expected = pathParams(entry.path).sort();
  const actual = Object.keys(shapes.params ?? {}).sort();
  return expected.join('\0') === actual.join('\0')
    ? []
    : [
        `params keys [${actual.join(', ')}] must equal the path parameters [${expected.join(', ')}]`,
      ];
}

/**
 * Rule 6: query fields accept string input.
 *
 * @param shapes - Slot shapes.
 * @returns Violations.
 */
function checkQueryFields(shapes: SlotShapes): string[] {
  return Object.entries(shapes.query ?? {})
    .filter(([, schema]) => !acceptsQueryString(schema))
    .map(
      ([field]) =>
        `query field "${field}" must accept string input (string, string enum or literal, z.coerce.*, z.stringbool() or queryArray(...))`,
    );
}

/**
 * Rule 7: object request slots convert in both modes; JSON responses in
 * output mode.
 *
 * @param entry - The entry.
 * @param shapes - Slot shapes (non-object slots are rule 3's concern).
 * @returns Violations.
 */
function checkConvertible(entry: CatalogEntry, shapes: SlotShapes): string[] {
  const violations: string[] = [];
  for (const slot of REQUEST_SLOTS) {
    const schema = entry[slot];
    if (!schema || !shapes[slot]) continue;
    for (const io of ['input', 'output'] as const)
      if (!converts(schema, io))
        violations.push(`${slot} does not convert to JSON Schema (io: ${io})`);
  }
  if (
    isJsonContentType(entry.contentType) &&
    !converts(entry.response, 'output')
  )
    violations.push('response does not convert to JSON Schema (io: output)');
  return violations;
}

/**
 * Rule 8: a non-JSON response is bytes or text.
 *
 * @param entry - The entry.
 * @returns Violations.
 */
function checkNonJsonResponse(entry: CatalogEntry): string[] {
  if (isJsonContentType(entry.contentType)) return [];
  const { type } = defOf(entry.response);
  const bytes =
    type === 'custom' && entry.response.safeParse(new Uint8Array()).success;
  return type === 'string' || bytes
    ? []
    : ['a non-JSON response must be z.instanceof(Uint8Array) or z.string()'];
}

/**
 * The per-entry rules (1 and 3-8) for one entry.
 *
 * @param entry - The entry.
 * @returns Violation messages, each prefixed with the entry name.
 */
export function checkEntry(entry: CatalogEntry): string[] {
  const { shapes, violations: slotViolations } = checkObjectSlots(entry);
  return [
    ...checkName(entry),
    ...slotViolations,
    ...checkFieldCollisions(shapes),
    ...checkPathParams(entry, shapes),
    ...checkQueryFields(shapes),
    ...checkConvertible(entry, shapes),
    ...checkNonJsonResponse(entry),
  ].map((v) => `entry "${entry.name}": ${v}`);
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
