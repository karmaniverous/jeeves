/**
 * Parse managed block from file content.
 *
 * @remarks
 * Extracts managed content delimited by comment markers, parses H2
 * sections within the block, and returns the structured result plus
 * user content outside the markers.
 */

import { TOOLS_MARKERS, VERSION_STAMP_PATTERN } from '../constants/index.js';
import { sortSectionsByOrder } from './sectionSort.js';

/** A parsed H2 section within the managed block. */
export interface ManagedSection {
  /** Section heading text (without the `## ` prefix). */
  id: string;
  /** Content below the heading (trimmed). */
  content: string;
}

/** Version stamp extracted from the BEGIN marker. */
export interface VersionStamp {
  /** Core library version (semver). */
  version: string;
  /** ISO timestamp of last write. */
  timestamp: string;
}

/** Result of parsing a managed block from file content. */
export interface ParseManagedResult {
  /** Whether valid markers were found. */
  found: boolean;
  /** Version stamp from the BEGIN marker, if present. */
  versionStamp: VersionStamp | undefined;
  /** Raw managed block content (between markers, excluding markers). */
  managedContent: string;
  /** Parsed H2 sections within the managed block. */
  sections: ManagedSection[];
  /** Content before the BEGIN marker. */
  beforeContent: string;
  /** Content after the END marker (user content). */
  userContent: string;
}

/**
 * Build regex patterns for the given markers.
 *
 * @param markers - Begin/end marker strings.
 * @returns Object with begin and end regex patterns.
 */
function buildMarkerPatterns(markers: { begin: string; end: string }): {
  beginRe: RegExp;
  endRe: RegExp;
} {
  const escapedBegin = markers.begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = markers.end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    beginRe: new RegExp(
      `^<!--\\s*${escapedBegin}(?:\\s*\\|[^>]*)?\\s*(?:—[^>]*)?\\s*-->\\s*$`,
      'm',
    ),
    endRe: new RegExp(`^<!--\\s*${escapedEnd}\\s*-->\\s*$`, 'm'),
  };
}

/**
 * Parse H2 sections from managed block content.
 *
 * @param content - Raw managed block content.
 * @returns Array of parsed sections in stable order.
 */
function parseSections(content: string): ManagedSection[] {
  const lines = content.split('\n');
  const sections: ManagedSection[] = [];
  let currentId: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h2Match = /^## (.+)$/.exec(line);
    if (h2Match) {
      if (currentId !== undefined) {
        sections.push({
          id: currentId,
          content: currentLines.join('\n').trim(),
        });
      }
      currentId = h2Match[1]!;
      currentLines = [];
    } else if (currentId !== undefined) {
      currentLines.push(line);
    }
  }

  if (currentId !== undefined) {
    sections.push({
      id: currentId,
      content: currentLines.join('\n').trim(),
    });
  }

  return sortSectionsByOrder(sections);
}

/**
 * Parse a managed block from file content.
 *
 * @param fileContent - Full file content.
 * @param markers - Optional custom markers (defaults to TOOLS markers).
 * @returns Parsed result with sections, version stamp, and user content.
 */
export function parseManaged(
  fileContent: string,
  markers: { begin: string; end: string } = TOOLS_MARKERS,
): ParseManagedResult {
  const { beginRe, endRe } = buildMarkerPatterns(markers);

  const beginMatch = beginRe.exec(fileContent);
  if (!beginMatch) {
    return {
      found: false,
      versionStamp: undefined,
      managedContent: '',
      sections: [],
      beforeContent: '',
      userContent: fileContent,
    };
  }

  const endMatch = endRe.exec(
    fileContent.slice(beginMatch.index + beginMatch[0].length),
  );
  if (!endMatch) {
    // Corrupt: BEGIN without END — treat as fresh file
    return {
      found: false,
      versionStamp: undefined,
      managedContent: '',
      sections: [],
      beforeContent: '',
      userContent: fileContent,
    };
  }

  const beforeContent = fileContent.slice(0, beginMatch.index).trim();
  const managedStart = beginMatch.index + beginMatch[0].length;
  const managedEnd = managedStart + endMatch.index;
  const managedContent = fileContent.slice(managedStart, managedEnd).trim();
  const afterEnd = managedStart + endMatch.index + endMatch[0].length;
  const userContent = fileContent.slice(afterEnd).trim();

  // Extract version stamp from BEGIN marker line
  let versionStamp: VersionStamp | undefined;
  const stampMatch = VERSION_STAMP_PATTERN.exec(beginMatch[0]);
  if (stampMatch?.[2] && stampMatch[3]) {
    versionStamp = {
      version: stampMatch[2],
      timestamp: stampMatch[3],
    };
  }

  const sections = parseSections(managedContent);

  return {
    found: true,
    versionStamp,
    managedContent,
    sections,
    beforeContent,
    userContent,
  };
}
