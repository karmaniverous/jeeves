/**
 * Factory function for creating a ComponentWriter.
 *
 * @remarks
 * Validates the component descriptor at runtime:
 * - `refreshIntervalSeconds` must be a prime number
 * - `serviceCommands` and `pluginCommands` must be provided
 * - `name`, `version`, `sectionId` must be non-empty strings
 * - `generateToolsContent` must be a function
 */

import { ComponentWriter } from './ComponentWriter.js';
import type { JeevesComponent } from './types.js';

/**
 * Check whether a number is prime.
 *
 * @param n - Number to check.
 * @returns `true` if n is prime.
 */
function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

/**
 * Validate a component descriptor at runtime.
 *
 * @param input - The descriptor to validate (typed as unknown for runtime safety).
 * @throws Error if the descriptor is invalid.
 */
function validateDescriptor(input: unknown): asserts input is JeevesComponent {
  const component = input as Record<string, unknown>;

  if (!component['name'] || typeof component['name'] !== 'string') {
    throw new Error('JeevesComponent.name must be a non-empty string');
  }
  if (!component['version'] || typeof component['version'] !== 'string') {
    throw new Error('JeevesComponent.version must be a non-empty string');
  }
  if (!component['sectionId'] || typeof component['sectionId'] !== 'string') {
    throw new Error('JeevesComponent.sectionId must be a non-empty string');
  }

  if (
    typeof component['refreshIntervalSeconds'] !== 'number' ||
    !isPrime(component['refreshIntervalSeconds'])
  ) {
    throw new Error(
      `JeevesComponent.refreshIntervalSeconds must be a prime number, got ${String(component['refreshIntervalSeconds'])}`,
    );
  }

  if (typeof component['generateToolsContent'] !== 'function') {
    throw new Error('JeevesComponent.generateToolsContent must be a function');
  }

  const svc = component['serviceCommands'] as
    | Record<string, unknown>
    | undefined;
  if (
    !svc ||
    typeof svc['stop'] !== 'function' ||
    typeof svc['uninstall'] !== 'function' ||
    typeof svc['status'] !== 'function'
  ) {
    throw new Error(
      'JeevesComponent.serviceCommands must provide stop, uninstall, and status functions',
    );
  }

  const plg = component['pluginCommands'] as
    | Record<string, unknown>
    | undefined;
  if (!plg || typeof plg['uninstall'] !== 'function') {
    throw new Error(
      'JeevesComponent.pluginCommands must provide an uninstall function',
    );
  }
}

/**
 * Create a ComponentWriter for a validated component descriptor.
 *
 * @param component - The component descriptor to validate and wrap.
 * @returns A new `ComponentWriter` instance.
 * @throws Error if the component descriptor is invalid.
 */
export function createComponentWriter(
  component: JeevesComponent,
): ComponentWriter {
  validateDescriptor(component);
  return new ComponentWriter(component);
}
