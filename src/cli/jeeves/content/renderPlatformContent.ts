/**
 * Render the static platform content into workspace-ready strings (pure,
 * internal to the jeeves CLI).
 *
 * @remarks
 * `jeeves install` writes the returned strings to disk; it is the only
 * writer. Only the SOUL/AGENTS managed blocks are rendered: core ships no
 * skills and no templates (both live in jeeves-tools). Re-rendering is
 * idempotent for a given stamp and preserves user content outside the
 * managed markers.
 *
 * @module
 */

import { CORE_VERSION } from '../../../constants/version.js';
import {
  type ManagedBlockStampOptions,
  renderManagedBlock,
  upsertManagedBlock,
} from '../../../managed/managedBlock.js';
import {
  PLATFORM_SECTIONS,
  type PlatformSectionId,
} from './platformContent.js';

/** Options for rendering platform content. */
export interface RenderPlatformContentOptions {
  /** Version written into managed-block stamps. Defaults to the core version. */
  version?: string;
  /** Render time written into stamps. Defaults to now. */
  now?: Date;
}

/** Rendered platform content. */
export interface RenderedPlatformContent {
  /** Complete managed blocks, keyed by section (see {@link upsertPlatformSection}). */
  sections: Record<PlatformSectionId, { file: string; block: string }>;
}

/** Resolve stamp options with defaults. */
function toStamp(
  options: RenderPlatformContentOptions,
): ManagedBlockStampOptions {
  return { version: options.version ?? CORE_VERSION, now: options.now };
}

/**
 * Render all static platform content.
 *
 * @param options - Stamp options.
 * @returns The managed blocks.
 */
export function renderPlatformContent(
  options: RenderPlatformContentOptions = {},
): RenderedPlatformContent {
  const stamp = toStamp(options);
  const section = (id: PlatformSectionId) => {
    const { file, markers, body } = PLATFORM_SECTIONS[id];
    return { file, block: renderManagedBlock(markers, body, stamp) };
  };

  return {
    sections: { soul: section('soul'), agents: section('agents') },
  };
}

/**
 * Insert or replace a platform managed section in existing file content.
 *
 * @param id - Section to render (`soul` or `agents`).
 * @param existingContent - Current file content (empty string if absent).
 * @param options - Stamp options.
 * @returns The new file content.
 */
export function upsertPlatformSection(
  id: PlatformSectionId,
  existingContent: string,
  options: RenderPlatformContentOptions = {},
): string {
  const { markers, body } = PLATFORM_SECTIONS[id];
  return upsertManagedBlock(existingContent, markers, body, toStamp(options));
}
