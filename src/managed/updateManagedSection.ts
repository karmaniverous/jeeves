/**
 * Generic managed-section writer with block and section modes.
 *
 * @remarks
 * Supports two modes:
 * - `block`: Replaces the entire managed block (SOUL.md, AGENTS.md).
 * - `section`: Upserts a named H2 section within the managed block (TOOLS.md).
 *
 * Provides version-stamp convergence and atomic writes.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  CLEANUP_FLAG,
  type ManagedMarkers,
  TOOLS_MARKERS,
} from '../constants/index.js';
import { getErrorMessage } from '../utils.js';
import { needsCleanup } from './cleanupDetection.js';
import { atomicWrite, DEFAULT_CORE_VERSION } from './fileOps.js';
import { escapeForRegex, parseManaged } from './parseManaged.js';
import { sortSectionsByOrder } from './sectionSort.js';
import { stripForeignMarkers } from './stripForeignMarkers.js';
import {
  formatBeginMarker,
  formatEndMarker,
  shouldWrite,
} from './versionStamp.js';

/** Options for updateManagedSection. */
export interface UpdateManagedSectionOptions {
  /** Write mode. Default: 'block'. */
  mode?: 'block' | 'section';
  /** Section ID — required when mode is 'section'. */
  sectionId?: string;
  /** Custom markers. Defaults to TOOLS markers. */
  markers?: ManagedMarkers;
  /** Core library version for version-stamp convergence. */
  coreVersion?: string;
  /** Staleness threshold in ms for version-stamp convergence. */
  stalenessThresholdMs?: number;
}

/**
 * Update a managed section in a file.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - New content to write.
 * @param options - Write mode and optional configuration.
 */
export function updateManagedSection(
  filePath: string,
  content: string,
  options: UpdateManagedSectionOptions = {},
): Promise<void> {
  const {
    mode = 'block',
    sectionId,
    markers = TOOLS_MARKERS,
    coreVersion = DEFAULT_CORE_VERSION,
    stalenessThresholdMs,
  } = options;

  if (mode === 'section' && !sectionId) {
    throw new Error('sectionId is required when mode is "section"');
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Create file if it doesn't exist
  if (!existsSync(filePath)) {
    writeFileSync(filePath, '', 'utf-8');
  }

  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = parseManaged(fileContent, markers);

    // Version-stamp convergence check (block mode only).
    // In section mode, components always write their own sections — the version
    // stamp governs shared content convergence, not component-specific sections.
    if (
      mode === 'block' &&
      !shouldWrite(coreVersion, parsed.versionStamp, stalenessThresholdMs)
    ) {
      return Promise.resolve();
    }

    let newManagedBody: string;

    if (mode === 'block') {
      // Prepend H1 title if markers specify one
      newManagedBody = markers.title
        ? `# ${markers.title}\n\n${content}`
        : content;
    } else {
      // Section mode: upsert the named section
      const sections = [...parsed.sections];
      const existingIdx = sections.findIndex((s) => s.id === sectionId);
      if (existingIdx >= 0) {
        sections[existingIdx] = { id: sectionId!, content };
      } else {
        sections.push({ id: sectionId!, content });
      }

      sortSectionsByOrder(sections);

      const sectionText = sections
        .map((s) => `## ${s.id}\n\n${s.content}`)
        .join('\n\n');

      // Prepend H1 title if markers specify one
      newManagedBody = markers.title
        ? `# ${markers.title}\n\n${sectionText}`
        : sectionText;
    }

    // Build the full managed block
    const beginLine = formatBeginMarker(markers.begin, coreVersion);
    const endLine = formatEndMarker(markers.end);

    // Combine all user content for cleanup detection
    const rawUserContent = [parsed.beforeContent, parsed.userContent]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    // Strip foreign managed blocks from user content (cross-contamination fix)
    const userContent = stripForeignMarkers(rawUserContent, markers);
    const cleanupNeeded = needsCleanup(newManagedBody, userContent);

    const managedParts: string[] = [];
    managedParts.push(beginLine);
    if (cleanupNeeded) {
      managedParts.push('');
      managedParts.push(CLEANUP_FLAG);
    }
    managedParts.push('');
    managedParts.push(newManagedBody);
    managedParts.push('');
    managedParts.push(endLine);

    const managedBlock = managedParts.join('\n');

    let newFileContent: string;

    if (parsed.found) {
      // Existing block: update in place — preserve position, don't move.
      // Strip foreign managed blocks from both content zones (cross-contamination fix).
      const cleanBefore = stripForeignMarkers(parsed.beforeContent, markers);
      const cleanAfter = stripForeignMarkers(parsed.userContent, markers);
      const fileParts: string[] = [];
      if (cleanBefore) {
        fileParts.push(cleanBefore);
        fileParts.push('');
      }
      fileParts.push(managedBlock);
      if (cleanAfter) {
        fileParts.push('');
        fileParts.push(cleanAfter);
      }
      fileParts.push('');
      newFileContent = fileParts.join('\n');
    } else {
      // No existing block: insert new block using the configured position.
      // Strip orphaned same-type BEGIN markers from user content to prevent
      // the parser from pairing them with the new END marker on the next cycle.
      const orphanedBeginRe = new RegExp(
        `^<!--\\s*${escapeForRegex(markers.begin)}(?:\\s*\\|[^>]*)?\\s*(?:—[^>]*)?\\s*-->\\s*$(?:\\r?\\n)?`,
        'gm',
      );
      const cleanUserContent = userContent
        .replace(orphanedBeginRe, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const position = markers.position ?? 'top';
      const fileParts: string[] = [];
      if (position === 'bottom') {
        if (cleanUserContent) {
          fileParts.push(cleanUserContent);
          fileParts.push('');
        }
        fileParts.push(managedBlock);
      } else {
        fileParts.push(managedBlock);
        if (cleanUserContent) {
          fileParts.push('');
          fileParts.push(cleanUserContent);
        }
      }
      fileParts.push('');
      newFileContent = fileParts.join('\n');
    }

    atomicWrite(filePath, newFileContent);
  } catch (err: unknown) {
    // Log warning but don't throw — writer cycles are periodic
    console.warn(
      `jeeves-core: updateManagedSection failed for ${filePath}: ${getErrorMessage(err)}`,
    );
  }

  return Promise.resolve();
}
