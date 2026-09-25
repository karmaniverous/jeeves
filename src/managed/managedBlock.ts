/**
 * Pure string transforms that render, insert, replace, and remove a Jeeves
 * managed block in workspace file content. No I/O.
 *
 * @remarks
 * Used by jeeves-tools (render at instance creation / deploy) and by
 * `jeeves install` / `jeeves uninstall`. An existing block is replaced in
 * place; a new block is inserted at the marker set's configured position.
 * User content outside the markers is preserved verbatim (trimmed).
 */

import type { ManagedMarkers } from '../constants/index.js';
import { beginMarkerPattern, parseManaged } from './parseManaged.js';

/** Options controlling the version stamp on a rendered BEGIN marker. */
export interface ManagedBlockStampOptions {
  /** Core library version written into the stamp. */
  version: string;
  /** Render time written into the stamp. Defaults to now. */
  now?: Date;
}

/**
 * Format the BEGIN marker comment with a version stamp.
 *
 * @param markerText - The marker text.
 * @param version - The core library version.
 * @param now - Render time. Defaults to now.
 * @returns Formatted comment line.
 */
export function formatBeginMarker(
  markerText: string,
  version: string,
  now: Date = new Date(),
): string {
  return `<!-- ${markerText} | core:${version} | ${now.toISOString()} -->`;
}

/**
 * Format the END marker comment.
 *
 * @param markerText - The marker text.
 * @returns Formatted comment line.
 */
export function formatEndMarker(markerText: string): string {
  return `<!-- ${markerText} -->`;
}

/**
 * Render a complete managed block (BEGIN marker, optional H1 title, body,
 * END marker).
 *
 * @param markers - Marker set.
 * @param body - Managed body (Markdown).
 * @param stamp - Version stamp options.
 * @returns The managed block, without a trailing newline.
 */
export function renderManagedBlock(
  markers: ManagedMarkers,
  body: string,
  stamp: ManagedBlockStampOptions,
): string {
  const content = markers.title
    ? `# ${markers.title}\n\n${body.trim()}`
    : body.trim();
  return [
    formatBeginMarker(markers.begin, stamp.version, stamp.now),
    '',
    content,
    '',
    formatEndMarker(markers.end),
  ].join('\n');
}

/** Join non-empty parts with blank lines and end with a single newline. */
function joinParts(parts: string[]): string {
  const kept = parts.filter((p) => p.length > 0);
  return kept.length > 0 ? kept.join('\n\n') + '\n' : '';
}

/**
 * Insert or replace the managed block in file content.
 *
 * @remarks
 * If a block with these markers exists, it is replaced in place. Otherwise
 * the block is inserted at `markers.position` (default `'top'`), and any
 * orphaned BEGIN marker of the same type is stripped from user content so it
 * cannot pair with the new END marker later.
 *
 * @param fileContent - Existing file content (empty string for a new file).
 * @param markers - Marker set.
 * @param body - Managed body (Markdown).
 * @param stamp - Version stamp options.
 * @returns The new file content.
 */
export function upsertManagedBlock(
  fileContent: string,
  markers: ManagedMarkers,
  body: string,
  stamp: ManagedBlockStampOptions,
): string {
  const block = renderManagedBlock(markers, body, stamp);
  const parsed = parseManaged(fileContent, markers);

  if (parsed.found) {
    return joinParts([parsed.beforeContent, block, parsed.userContent]);
  }

  const user = fileContent
    .replace(beginMarkerPattern(markers.begin, 'gm'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return (markers.position ?? 'top') === 'bottom'
    ? joinParts([user, block])
    : joinParts([block, user]);
}

/**
 * Remove the managed block from file content, keeping user content.
 *
 * @param fileContent - Existing file content.
 * @param markers - Marker set.
 * @returns The new file content (unchanged if no block is present).
 */
export function removeManagedBlock(
  fileContent: string,
  markers: Pick<ManagedMarkers, 'begin' | 'end'>,
): string {
  const parsed = parseManaged(fileContent, markers);
  if (!parsed.found) return fileContent;
  return joinParts([parsed.beforeContent, parsed.userContent]);
}
