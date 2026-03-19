/**
 * Remove a managed section or entire managed block from a file.
 *
 * @remarks
 * Supports two modes:
 * - No `sectionId`: Remove the entire managed block (markers + content),
 *   leaving user content intact.
 * - With `sectionId`: Remove a specific H2 section from within the
 *   managed block. If it was the last section, remove the entire block.
 *
 * Provides file-level locking and atomic writes (temp file + rename).
 * Missing markers or nonexistent sections are no-ops (no error thrown).
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { lock } from 'proper-lockfile';

import { TOOLS_MARKERS } from '../constants/index.js';
import { parseManaged } from './parseManaged.js';
import { sortSectionsByOrder } from './sectionSort.js';
import { formatBeginMarker, formatEndMarker } from './versionStamp.js';

/** Options for removeManagedSection. */
export interface RemoveManagedSectionOptions {
  /** Section ID to remove. If omitted, removes the entire managed block. */
  sectionId?: string;
  /** Custom markers. Defaults to TOOLS markers. */
  markers?: {
    /** BEGIN comment marker text. */
    begin: string;
    /** END comment marker text. */
    end: string;
    /** Optional H1 title prepended in section mode. */
    title?: string;
  };
}

/** Stale lock threshold in ms (2 minutes). */
const STALE_LOCK_MS = 120_000;

/**
 * Remove a managed section or entire managed block from a file.
 *
 * @param filePath - Absolute path to the target file.
 * @param options - Optional section ID and custom markers.
 */
export async function removeManagedSection(
  filePath: string,
  options: RemoveManagedSectionOptions = {},
): Promise<void> {
  const { sectionId, markers = TOOLS_MARKERS } = options;

  if (!existsSync(filePath)) return;

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(filePath, {
      stale: STALE_LOCK_MS,
      retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 },
    });

    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = parseManaged(fileContent, markers);

    if (!parsed.found) return;

    let newContent: string;

    if (!sectionId) {
      // Remove entire managed block
      newContent = buildWithoutBlock(parsed.beforeContent, parsed.userContent);
    } else {
      // Remove specific section
      const remaining = parsed.sections.filter((s) => s.id !== sectionId);

      if (remaining.length === parsed.sections.length) {
        // Section not found — no-op
        return;
      }

      if (remaining.length === 0) {
        // Last section removed — remove entire block
        newContent = buildWithoutBlock(
          parsed.beforeContent,
          parsed.userContent,
        );
      } else {
        // Rebuild managed block without the removed section
        newContent = buildWithSections(
          parsed.beforeContent,
          parsed.userContent,
          remaining,
          markers,
          parsed.versionStamp?.version,
        );
      }
    }

    // Atomic write
    const dir = dirname(filePath);
    const tempPath = join(dir, `.${String(Date.now())}.tmp`);
    writeFileSync(tempPath, newContent, 'utf-8');
    renameSync(tempPath, filePath);
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Lock already released or file deleted
      }
    }
  }
}

/** Build file content without the managed block. */
function buildWithoutBlock(beforeContent: string, userContent: string): string {
  const parts: string[] = [];
  if (beforeContent) parts.push(beforeContent);
  if (userContent) {
    if (parts.length > 0) parts.push('');
    parts.push(userContent);
  }
  if (parts.length === 0) return '';
  return parts.join('\n') + '\n';
}

/** Rebuild file content with remaining sections. */
function buildWithSections(
  beforeContent: string,
  userContent: string,
  sections: Array<{ id: string; content: string }>,
  markers: { begin: string; end: string; title?: string },
  coreVersion?: string,
): string {
  const sorted = sortSectionsByOrder([...sections]);
  const sectionText = sorted
    .map((s) => `## ${s.id}\n\n${s.content}`)
    .join('\n\n');

  const managedBody = markers.title
    ? `# ${markers.title}\n\n${sectionText}`
    : sectionText;

  const beginLine = formatBeginMarker(markers.begin, coreVersion ?? '0.0.0');
  const endLine = formatEndMarker(markers.end);

  const parts: string[] = [];
  if (beforeContent) {
    parts.push(beforeContent);
    parts.push('');
  }
  parts.push(beginLine);
  parts.push('');
  parts.push(managedBody);
  parts.push('');
  parts.push(endLine);
  if (userContent) {
    parts.push('');
    parts.push(userContent);
  }
  parts.push('');

  return parts.join('\n');
}
