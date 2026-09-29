/**
 * Platform component registry.
 *
 * @remarks
 * The four essential components that constitute the Jeeves platform.
 *
 * @module
 */

/** The four essential platform components. */
export const PLATFORM_COMPONENTS = [
  'runner',
  'watcher',
  'server',
  'meta',
] as const;

/** A platform component name. */
export type PlatformComponent = (typeof PLATFORM_COMPONENTS)[number];
