/**
 * Comment markers delimiting Jeeves managed content blocks in SOUL.md and AGENTS.md.
 *
 * @remarks
 * Managed content is enclosed in HTML comment markers so that re-rendering at
 * deploy time can replace the Jeeves block in place while leaving user content
 * outside the markers untouched. Marker text is unchanged from v0.x so that
 * blocks written by earlier versions are recognised and replaced.
 */

/** Shape of a managed content marker set. */
export interface ManagedMarkers {
  /** BEGIN comment marker text. */
  begin: string;
  /** END comment marker text. */
  end: string;
  /** Optional H1 title prepended inside the managed block. */
  title?: string;
  /**
   * Position of a newly inserted managed block within the file.
   * - `'top'`: managed block first, user content below.
   * - `'bottom'`: user content first, managed block at end.
   *
   * @defaultValue `'top'`
   */
  position?: 'top' | 'bottom';
}

/** Markers for the SOUL.md managed block. */
export const SOUL_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES SOUL',
  /** H1 title prepended in the managed block. */
  title: 'Jeeves Platform Soul',
  /** Managed block at bottom of file. */
  position: 'bottom',
} as const;

/** Markers for the AGENTS.md managed block. */
export const AGENTS_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES AGENTS — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES AGENTS',
  /** H1 title prepended in the managed block. */
  title: 'Jeeves Platform Agents',
  /** Managed block at bottom of file. */
  position: 'bottom',
} as const;

/**
 * Markers for the legacy (v0.x) TOOLS.md managed block.
 *
 * @remarks
 * OpenClaw 2026.9.6 no longer loads TOOLS.md, and Jeeves no longer writes it.
 * Retained only so that tooling can recognise and strip blocks written by
 * earlier versions (e.g. `jeeves uninstall`).
 */
export const LEGACY_TOOLS_MARKERS: ManagedMarkers = {
  /** BEGIN comment marker text. */
  begin: 'BEGIN JEEVES PLATFORM TOOLS — DO NOT EDIT THIS SECTION',
  /** END comment marker text. */
  end: 'END JEEVES PLATFORM TOOLS',
  /** H1 title used by v0.x. */
  title: 'Jeeves Platform Tools',
  /** Managed block at bottom of file. */
  position: 'bottom',
} as const;

/**
 * Regex pattern to extract the version stamp from a BEGIN marker comment.
 *
 * @remarks
 * Format: `\<!-- BEGIN MARKER | core:X.Y.Z | ISO-TIMESTAMP --\>`
 * Captures: [1] marker text, [2] version, [3] timestamp
 */
export const VERSION_STAMP_PATTERN =
  /<!--\s*(.+?)\s*\|\s*core:(\S+)\s*\|\s*(\S+)\s*-->/;
