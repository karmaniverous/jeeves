/**
 * Response serializers for catalog routes (spec 5.5, 5c.1).
 *
 * @module
 */

import type { z } from 'zod';

import { errorBodySchema } from '../catalog/errorBody.js';
import {
  isBuiltErrorBody,
  ResponseMismatchError,
  unbuiltErrorBody,
} from './errorReply.js';
import type { CatalogRouteLogger } from './types.js';

/**
 * The serializer for one response schema.
 *
 * @param schema - Response schema for the status range.
 * @param mode - `strict` or `log`.
 * @param warn - Logs a `log`-mode mismatch.
 * @returns Payload to JSON string.
 */
export function serializerFor(
  schema: z.ZodType,
  mode: 'strict' | 'log',
  warn: (issues: z.core.$ZodIssue[]) => void,
): (payload: unknown) => string {
  return (payload) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) return JSON.stringify(parsed.data);
    if (mode === 'strict') throw new ResponseMismatchError(parsed.error.issues);
    warn(parsed.error.issues);
    return JSON.stringify(payload);
  };
}

/**
 * The serializer for an entry's `4xx`/`5xx` responses: only bodies core
 * built go out. Anything else reached it through Fastify's fallback (a hook
 * threw while an error reply was being sent) and is replaced with the
 * masked standard body ({@link unbuiltErrorBody}).
 *
 * @param log - Where an unbuilt payload is logged.
 * @returns Payload to JSON string.
 */
export function errorSerializerFor(
  log: Pick<CatalogRouteLogger, 'error'>,
): (payload: unknown) => string {
  return (payload) =>
    JSON.stringify(
      isBuiltErrorBody(payload)
        ? errorBodySchema.parse(payload)
        : unbuiltErrorBody(payload, log),
    );
}
