/**
 * Request validation of catalog schemas with Zod (spec 5a.2, Decision 89).
 *
 * @remarks
 * Core's own replacement for the two pieces of `fastify-type-provider-zod`
 * that `/fastify` used, so the entry point loads nothing at run time beyond
 * jeeves and `zod`, wherever core is installed. Entries keep the shape
 * Fastify's default error formatter reads (`instancePath`, `keyword`,
 * `message`, `params`), so a validation error that reaches the app's own
 * error handler still has Fastify's usual message.
 *
 * @module
 */

import type { z } from 'zod';

/** Marks the entries this module's validator returns. */
const MARK = Symbol('jeeves.catalogValidationEntry');

/** One request-validation failure, as Fastify carries it on the error. */
export interface ValidationEntry {
  /** Marker distinguishing these entries from other validators'. */
  [MARK]: true;
  /** The Zod issue's code. */
  keyword: string;
  /** JSON pointer to the failing value, e.g. `/a/0`. */
  instancePath: string;
  /** Schema location, for Fastify's formatter. */
  schemaPath: string;
  /** Human-readable message. */
  message: string;
  /** The Zod issue's other fields (e.g. `expected`, `minimum`). */
  params: Record<string, unknown>;
}

/**
 * Validation entries for Zod issues.
 *
 * @param issues - Zod issues from a failed parse.
 * @returns One entry per issue.
 */
function entriesOf(issues: z.core.$ZodIssue[]): ValidationEntry[] {
  return issues.map((issue) => {
    const { path, code, message, ...params } = issue;
    const pointer = path.map(String).join('/');
    return {
      [MARK]: true,
      keyword: code,
      instancePath: `/${pointer}`,
      schemaPath: `#/${pointer}/${code}`,
      message,
      params,
    };
  });
}

/**
 * Fastify validator compiler for catalog slot schemas: parses the request
 * part with its Zod schema and returns the parsed value or the failures.
 *
 * @param route - Fastify's compile input; `schema` is the slot's Zod schema.
 * @returns The validator for that slot.
 */
export function validatorCompiler({ schema }: { schema: unknown }) {
  return (data: unknown): { value: unknown } | { error: ValidationEntry[] } => {
    const result = (schema as z.ZodType).safeParse(data);
    return result.success
      ? { value: result.data }
      : { error: entriesOf(result.error.issues) };
  };
}

/**
 * Whether an error is a request-validation error from
 * {@link validatorCompiler}.
 *
 * @param error - Any thrown value.
 * @returns True when its `validation` entries are this module's.
 */
export function isCatalogValidationError(
  error: unknown,
): error is { validation: ValidationEntry[]; validationContext: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { validation } = error as { validation?: unknown };
  return (
    Array.isArray(validation) &&
    (validation[0] as Partial<ValidationEntry> | null)?.[MARK] === true
  );
}
