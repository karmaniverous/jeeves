/**
 * Factory function for creating a ComponentWriter from a descriptor.
 *
 * @remarks
 * Validates the descriptor via Zod schema and creates a ComponentWriter.
 * Accepts `JeevesComponentDescriptor` (v0.5.0) only. The v0.4.0
 * `JeevesComponent` interface is no longer accepted.
 */

import { ComponentWriter } from './ComponentWriter.js';
import type { JeevesComponentDescriptor } from './descriptor.js';
import { jeevesComponentDescriptorSchema } from './descriptor.js';

/**
 * Create a ComponentWriter for a validated component descriptor.
 *
 * @remarks
 * The descriptor is validated via the Zod schema at runtime.
 * This replaces the v0.4.0 `createComponentWriter(JeevesComponent)`.
 *
 * @param descriptor - The component descriptor to validate and wrap.
 * @returns A new `ComponentWriter` instance.
 * @throws ZodError if the descriptor is invalid.
 */
export function createComponentWriter(
  descriptor: JeevesComponentDescriptor,
): ComponentWriter {
  // Validate via Zod — throws ZodError with detailed messages on failure
  jeevesComponentDescriptorSchema.parse(descriptor);
  return new ComponentWriter(descriptor);
}
