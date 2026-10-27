/**
 * Request building from one flat input object (spec 5.3).
 *
 * @module
 */

import { z } from 'zod';

import { CatalogClientError } from './clientError.js';
import { PATH_PARAM, REQUEST_SLOTS, shapeOf } from './schemaHelpers.js';
import type { CatalogEntry } from './types.js';

/** Wire input of an optional slot schema; `unknown` when absent. */
export type SlotInput<S> = S extends z.ZodType ? z.input<S> : unknown;

/**
 * One flat input object for an entry: its `params`, `query` and `body`
 * fields merged (rule 4 keeps their names distinct).
 */
export type CatalogInput<E extends CatalogEntry> = SlotInput<E['params']> &
  SlotInput<E['query']> &
  SlotInput<E['body']>;

/** A built request, ready for a transport. */
export interface CatalogRequest {
  /** HTTP method. */
  method: CatalogEntry['method'];
  /** Path with parameters filled in and encoded. */
  path: string;
  /** Query pairs; a key repeats for each array item. */
  query: [string, string][];
  /** JSON body; absent when the entry has none. */
  body?: Record<string, unknown>;
  /** Request headers (credentials are added by the caller). */
  headers: Record<string, string>;
}

/**
 * The merged object schema of an entry's request slots.
 *
 * @param entry - Catalog entry.
 * @returns A Zod object over every request field.
 */
export function mergedInputSchema(entry: CatalogEntry): z.ZodObject {
  return z.object(
    Object.assign(
      {},
      ...REQUEST_SLOTS.map((slot) => {
        const schema = entry[slot];
        return schema ? shapeOf(schema) : {};
      }),
    ) as z.ZodRawShape,
  );
}

/**
 * Fields of `input` that belong to a slot.
 *
 * @param entry - Catalog entry.
 * @param slot - Slot name.
 * @param input - Flat input.
 * @returns `[field, value]` pairs present and not undefined.
 */
function slotFields(
  entry: CatalogEntry,
  slot: 'params' | 'query' | 'body',
  input: Record<string, unknown>,
): [string, unknown][] {
  const schema = entry[slot];
  // Rule 3 guarantees an object schema.
  const shape = schema ? (shapeOf(schema) as Record<string, unknown>) : {};
  return Object.keys(shape)
    .filter((field) => input[field] !== undefined)
    .map((field) => [field, input[field]]);
}

/**
 * A path or query value as a string.
 *
 * @param value - Scalar value.
 * @returns Its string form.
 */
const asString = (value: unknown): string =>
  typeof value === 'string' ? value : String(value);

/**
 * Turn one flat input object into a request for an entry.
 *
 * @remarks
 * The input is validated with the merged schema first; values are then sent
 * in their wire (input) form: `:param` segments `encodeURIComponent`-encoded,
 * a `*` wildcard encoded per segment with `/` kept, query scalars as strings
 * and arrays as repeated keys, and body fields as JSON.
 *
 * @param entry - Catalog entry.
 * @param input - Flat input.
 * @returns The request.
 * @throws {@link CatalogClientError} with status 0 and the Zod issues when
 *   the input is invalid.
 */
export function buildCatalogRequest<E extends CatalogEntry>(
  entry: E,
  input: CatalogInput<E>,
): CatalogRequest {
  const flat = (input ?? {}) as Record<string, unknown>;
  const parsed = mergedInputSchema(entry).safeParse(flat);
  if (!parsed.success)
    throw new CatalogClientError(`Invalid input for "${entry.name}"`, {
      status: 0,
      issues: parsed.error.issues,
    });

  const params = Object.fromEntries(slotFields(entry, 'params', flat));
  const path = entry.path
    .replace(PATH_PARAM, (_m, name: string) =>
      encodeURIComponent(asString(params[name])),
    )
    .replace('*', () =>
      asString(params['*']).split('/').map(encodeURIComponent).join('/'),
    );

  const query = slotFields(entry, 'query', flat).flatMap(
    ([field, value]): [string, string][] =>
      (Array.isArray(value) ? value : [value]).map((v) => [field, asString(v)]),
  );

  const request: CatalogRequest = {
    method: entry.method,
    path,
    query,
    headers: {},
  };
  if (entry.body)
    request.body = Object.fromEntries(slotFields(entry, 'body', flat));
  return request;
}
