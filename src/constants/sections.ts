/**
 * Managed section IDs, stable ordering, and platform component registry.
 *
 * @remarks
 * Section ordering is fixed to prevent diff churn regardless of which
 * component writes last. Sections always appear in this order.
 */

/** Known section IDs for TOOLS.md managed block. */
export const SECTION_IDS = {
  /** Platform health and guidance section. */
  Platform: 'Platform',
  /** Watcher index stats and search configuration. */
  Watcher: 'Watcher',
  /** Server export capabilities and connected services. */
  Server: 'Server',
  /** Runner job status and active scripts. */
  Runner: 'Runner',
  /** Meta synthesis entity summary and tools. */
  Meta: 'Meta',
} as const;

/** Section ID type. */
export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

/**
 * Stable ordering of sections within the managed TOOLS.md block.
 * Sections always appear in this order regardless of write order.
 */
export const SECTION_ORDER: readonly string[] = [
  SECTION_IDS.Platform,
  SECTION_IDS.Watcher,
  SECTION_IDS.Server,
  SECTION_IDS.Runner,
  SECTION_IDS.Meta,
] as const;

/**
 * The four essential platform components.
 *
 * @remarks
 * These components constitute the Jeeves platform. `jeeves install` writes
 * initial HEARTBEAT "Not installed" alerts for all of them. The HEARTBEAT
 * writer generates "Not installed" alerts only for platform components not
 * in `component-versions.json`. Optional future components (not in this list)
 * appear in HEARTBEAT only after explicit install.
 */
export const PLATFORM_COMPONENTS = [
  'runner',
  'watcher',
  'server',
  'meta',
] as const;

/** A platform component name. */
export type PlatformComponent = (typeof PLATFORM_COMPONENTS)[number];
