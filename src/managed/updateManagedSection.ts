/**
 * Generic managed-section writer with block and section modes.
 *
 * @remarks
 * Supports two modes:
 * - `block`: Replaces the entire managed block (SOUL.md, AGENTS.md).
 * - `section`: Upserts a named H2 section within the managed block (TOOLS.md).
 *
 * Provides file-level locking, version-stamp convergence, and atomic writes.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { lock } from 'proper-lockfile';

import { TOOLS_MARKERS } from '../constants/index.js';
import { SECTION_ORDER } from '../constants/sections.js';
import { needsCleanup } from './cleanupDetection.js';
import { parseManaged } from './parseManaged.js';
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
  markers?: { begin: string; end: string };
  /** Core library version for version-stamp convergence. */
  coreVersion?: string;
  /** Staleness threshold in ms for version-stamp convergence. */
  stalenessThresholdMs?: number;
}

/** Default core version when none provided. */
const DEFAULT_VERSION = '0.0.0';

/** Stale lock threshold in ms (2 minutes). */
const STALE_LOCK_MS = 120_000;

/**
 * Update a managed section in a file.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - New content to write.
 * @param options - Write mode and optional configuration.
 */
export async function updateManagedSection(
  filePath: string,
  content: string,
  options: UpdateManagedSectionOptions = {},
): Promise<void> {
  const {
    mode = 'block',
    sectionId,
    markers = TOOLS_MARKERS,
    coreVersion = DEFAULT_VERSION,
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

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lock(filePath, {
      stale: STALE_LOCK_MS,
      retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 },
    });

    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = parseManaged(fileContent, markers);

    // Version-stamp convergence check
    if (!shouldWrite(coreVersion, parsed.versionStamp, stalenessThresholdMs)) {
      return;
    }

    let newManagedBody: string;

    if (mode === 'block') {
      newManagedBody = content;
    } else {
      // Section mode: upsert the named section
      const sections = [...parsed.sections];
      const existingIdx = sections.findIndex((s) => s.id === sectionId);
      if (existingIdx >= 0) {
        sections[existingIdx] = { id: sectionId!, content };
      } else {
        sections.push({ id: sectionId!, content });
      }

      // Sort sections by stable order
      sections.sort((a, b) => {
        const aIdx = SECTION_ORDER.indexOf(a.id);
        const bIdx = SECTION_ORDER.indexOf(b.id);
        const aOrder = aIdx === -1 ? SECTION_ORDER.length : aIdx;
        const bOrder = bIdx === -1 ? SECTION_ORDER.length : bIdx;
        return aOrder - bOrder;
      });

      newManagedBody = sections
        .map((s) => `## ${s.id}\n\n${s.content}`)
        .join('\n\n');
    }

    // Cleanup detection
    const userContent = parsed.userContent;
    const cleanupNeeded = needsCleanup(newManagedBody, userContent);

    // Build the full managed block
    const beginLine = formatBeginMarker(markers.begin, coreVersion);
    const endLine = formatEndMarker(markers.end);

    const parts: string[] = [];
    if (parsed.beforeContent) {
      parts.push(parsed.beforeContent);
      parts.push('');
    }
    parts.push(beginLine);
    if (cleanupNeeded) {
      parts.push('');
      parts.push(
        '> ⚠️ CLEANUP NEEDED: Orphaned Jeeves content may exist below this managed section. Review everything after the END marker and remove any content that duplicates what appears above.',
      );
    }
    parts.push('');
    parts.push(newManagedBody);
    parts.push('');
    parts.push(endLine);
    if (userContent) {
      parts.push('');
      parts.push(userContent);
    }
    parts.push('');

    const newFileContent = parts.join('\n');

    // Atomic write: write to temp file, then rename
    const tempPath = join(dir, `.${String(Date.now())}.tmp`);
    writeFileSync(tempPath, newFileContent, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (err: unknown) {
    // Log warning but don't throw — writer cycles are periodic
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `jeeves-core: updateManagedSection failed for ${filePath}: ${message}`,
    );
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Lock already released or file deleted — safe to ignore
      }
    }
  }
}
