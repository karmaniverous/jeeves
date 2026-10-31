/**
 * The shared error body (spec 5.2).
 *
 * @module
 */

import { z } from 'zod';

/**
 * Body of every non-2xx catalog response: `{ error }` plus any extra fields
 * (for example the Zod `issues` config apply returns). The shape core's
 * existing handlers already return.
 */
export const errorBodySchema = z.looseObject({
  /** Human-readable error message. */
  error: z.string(),
});

/** A non-2xx catalog response body. */
export type ErrorBody = z.infer<typeof errorBodySchema>;
