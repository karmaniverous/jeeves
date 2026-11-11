/**
 * The shared error body (spec 5c.1, 5d.1).
 *
 * @module
 */

import { z } from 'zod';

/**
 * Body of every non-2xx catalog response: exactly Fastify's default error
 * body. A plain object schema, so parsing or serializing through it drops
 * any other field: extra fields never reach the wire.
 */
export const errorBodySchema = z.object({
  /** HTTP status, as a number. */
  statusCode: z.number().int(),
  /**
   * Machine-readable code (e.g. `FST_ERR_VALIDATION`, `RUNNER_JOB_EXISTS`).
   * Present on Fastify's own 4xx errors, on every `defineError` error and
   * on error results sent with one; absent otherwise (any other thrown
   * error, Fastify's unknown-route 404, an error sent without one), so
   * clients must tolerate its absence.
   * Clients branch on it, never on `message`.
   */
  code: z.string().optional(),
  /** Standard HTTP status text (`Bad Request`, `Conflict`, ...). */
  error: z.string(),
  /**
   * Human-readable message. A `defineError` error and a handler error
   * result keep their own on a 5xx too, written for the caller; any other
   * thrown error's is the generic `SERVER_ERROR_MESSAGE`.
   */
  message: z.string(),
});

/** A non-2xx catalog response body. */
export type ErrorBody = z.infer<typeof errorBodySchema>;
