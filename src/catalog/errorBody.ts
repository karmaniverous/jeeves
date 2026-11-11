/**
 * The shared error body (spec 5c.1).
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
   * Present on Fastify's own errors and on every deliberate error made with
   * a code; absent otherwise (an unexpected crash, Fastify's unknown-route
   * 404, an error sent without one), so clients must tolerate its absence.
   * Clients branch on it, never on `message`.
   */
  code: z.string().optional(),
  /** Standard HTTP status text (`Bad Request`, `Conflict`, ...). */
  error: z.string(),
  /** Human-readable message; generic on every 5xx. */
  message: z.string(),
});

/** A non-2xx catalog response body. */
export type ErrorBody = z.infer<typeof errorBodySchema>;
