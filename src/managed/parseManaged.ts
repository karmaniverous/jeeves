/**
 * Parse a Jeeves managed block out of workspace file content (pure).
 *
 * @remarks
 * Locates the BEGIN/END comment markers, extracts the managed content and its
 * version stamp, and returns the user content before and after the block.
 */

import {
  type ManagedMarkers,
  VERSION_STAMP_PATTERN,
} from '../constants/index.js';

/** Version stamp extracted from the BEGIN marker. */
export interface VersionStamp {
  /** Core library version (semver). */
  version: string;
  /** ISO timestamp of the render. */
  timestamp: string;
}

/** Result of parsing a managed block from file content. */
export interface ParseManagedResult {
  /** Whether a valid BEGIN/END marker pair was found. */
  found: boolean;
  /** Version stamp from the BEGIN marker, if present. */
  versionStamp: VersionStamp | undefined;
  /** Raw managed block content (between markers, excluding markers). */
  managedContent: string;
  /** Content before the BEGIN marker (trimmed). */
  beforeContent: string;
  /** Content after the END marker (trimmed), or the whole file if not found. */
  userContent: string;
}

/**
 * Escape a string for safe use as a literal in a RegExp pattern.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
export function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the regex matching a BEGIN marker line (with optional stamp).
 *
 * @param begin - BEGIN marker text.
 * @param flags - RegExp flags.
 * @returns The BEGIN marker regex.
 */
export function beginMarkerPattern(begin: string, flags = 'm'): RegExp {
  return new RegExp(
    `^<!--\\s*${escapeForRegex(begin)}(?:\\s*\\|[^>]*)?\\s*(?:—[^>]*)?\\s*-->\\s*$`,
    flags,
  );
}

/**
 * Parse a managed block from file content.
 *
 * @param fileContent - Full file content.
 * @param markers - BEGIN/END marker pair to look for.
 * @returns Parsed result with version stamp and surrounding user content.
 */
export function parseManaged(
  fileContent: string,
  markers: Pick<ManagedMarkers, 'begin' | 'end'>,
): ParseManagedResult {
  const notFound: ParseManagedResult = {
    found: false,
    versionStamp: undefined,
    managedContent: '',
    beforeContent: '',
    userContent: fileContent,
  };

  const beginMatch = beginMarkerPattern(markers.begin).exec(fileContent);
  if (!beginMatch) return notFound;

  const endRe = new RegExp(
    `^<!--\\s*${escapeForRegex(markers.end)}\\s*-->\\s*$`,
    'm',
  );
  const managedStart = beginMatch.index + beginMatch[0].length;
  const endMatch = endRe.exec(fileContent.slice(managedStart));
  // Corrupt: BEGIN without END — treat as a fresh file.
  if (!endMatch) return notFound;

  const managedEnd = managedStart + endMatch.index;
  const afterEnd = managedEnd + endMatch[0].length;

  let versionStamp: VersionStamp | undefined;
  const stampMatch = VERSION_STAMP_PATTERN.exec(beginMatch[0]);
  if (stampMatch?.[2] && stampMatch[3]) {
    versionStamp = { version: stampMatch[2], timestamp: stampMatch[3] };
  }

  return {
    found: true,
    versionStamp,
    managedContent: fileContent.slice(managedStart, managedEnd).trim(),
    beforeContent: fileContent.slice(0, beginMatch.index).trim(),
    userContent: fileContent.slice(afterEnd).trim(),
  };
}
