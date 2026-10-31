/**
 * Query-string array helper (spec 5.2).
 *
 * @module
 */

import { z } from 'zod';

/** Schemas built by {@link queryArray}, so rule 6 can recognise them. */
const queryArrays = z.registry();

/**
 * A query field holding a list. Fastify delivers a repeated key as an array
 * but a single occurrence as a plain value; this accepts either and always
 * yields an array.
 *
 * @remarks
 * A codec, so both sides convert to JSON Schema (spec 5.2 rule 7): the input
 * side is "an array or one value" (the wire shape), the output side "an
 * array" (what handlers and tools see). The array branch is tried first, so
 * a coercing `item` never swallows a whole array (`String(['a', 'b'])`).
 *
 * @param item - Schema for one value; must itself accept string input.
 * @returns The codec.
 */
export function queryArray<T extends z.ZodType>(item: T) {
  const list = z.array(item);
  const schema = z.codec(z.union([list, item]), list, {
    decode: (value) =>
      (Array.isArray(value) ? value : [value]) as z.input<typeof list>,
    encode: (value) => value as never,
  });
  queryArrays.add(schema);
  return schema;
}

/**
 * Whether a schema was built by {@link queryArray}.
 *
 * @param schema - Schema to test.
 * @returns True for a `queryArray` codec.
 */
export function isQueryArray(schema: z.core.$ZodType): boolean {
  return queryArrays.has(schema);
}

/**
 * The item schema of a {@link queryArray} codec.
 *
 * @param schema - A `queryArray` codec.
 * @returns Its item schema.
 */
export function queryArrayItem(schema: z.core.$ZodType): z.core.$ZodType {
  const out = (schema._zod.def as unknown as { out: z.core.$ZodType }).out;
  return (out._zod.def as unknown as { element: z.core.$ZodType }).element;
}
