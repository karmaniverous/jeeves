/**
 * Managed section IDs and their stable ordering for TOOLS.md.
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
