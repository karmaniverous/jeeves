/**
 * Comment markers for managed content blocks.
 *
 * @remarks
 * Managed content in TOOLS.md, SOUL.md, and AGENTS.md is enclosed
 * in HTML comment markers. Content between markers is refreshed
 * atomically on each writer cycle. User content outside the markers
 * is never touched.
 */

/** Shape of managed content markers used by updateManagedSection and removeManagedSection. */
export interface ManagedMarkers {
  /** BEGIN comment marker text. */
  begin: string;
  /** END comment marker text. */
  end: string;
  /** Optional H1 title prepended inside the managed block. */
  title?: string;
}

/** Default markers for TOOLS.md managed block. */
export const TOOLS_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES PLATFORM TOOLS — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES PLATFORM TOOLS',
  /** H1 title prepended in section mode. */
  title: 'Jeeves Platform Tools',
} as const;

/** Default markers for SOUL.md managed block. */
export const SOUL_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES SOUL',
  /** H1 title prepended in the managed block. */
  title: 'Jeeves Platform Soul',
} as const;

/** Default markers for AGENTS.md managed block. */
export const AGENTS_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES AGENTS — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES AGENTS',
  /** H1 title prepended in the managed block. */
  title: 'Jeeves Platform Agents',
} as const;

/**
 * Regex pattern to extract version stamp from a BEGIN marker comment.
 *
 * @remarks
 * Format: `\<!-- BEGIN MARKER | core:X.Y.Z | ISO-TIMESTAMP --\>`
 * Captures: [1] marker text, [2] version, [3] timestamp
 */
export const VERSION_STAMP_PATTERN =
  /<!--\s*(.+?)\s*\|\s*core:(\S+)\s*\|\s*(\S+)\s*-->/;

/** Staleness threshold for version-stamp convergence in milliseconds. */
export const STALENESS_THRESHOLD_MS = 5 * 60 * 1000;

/** Warning text prepended inside managed block when cleanup is needed. */
export const CLEANUP_FLAG =
  '> ⚠️ CLEANUP NEEDED: Orphaned Jeeves content may exist below this managed section. Review everything after the END marker and remove any content that duplicates what appears above.';
