/**
 * Render the static platform content into workspace-ready strings (pure).
 *
 * @remarks
 * Consumers (jeeves-tools at instance creation / deploy, `jeeves install`)
 * write the returned strings to disk. Re-rendering is idempotent for a given
 * stamp and preserves user content outside the managed markers.
 *
 * @module
 */

import { SKILLS_DIR, TEMPLATES_DIR } from '../constants/paths.js';
import { CORE_VERSION } from '../constants/version.js';
import {
  type ManagedBlockStampOptions,
  renderManagedBlock,
  upsertManagedBlock,
} from '../managed/managedBlock.js';
import {
  PLATFORM_SECTIONS,
  PLATFORM_SKILLS,
  PLATFORM_TEMPLATES,
  type PlatformSectionId,
} from './platformContent.js';

/** A file to write, relative to a base directory. */
export interface RenderedFile {
  /** Relative path using forward slashes (e.g. `skills/jeeves/SKILL.md`). */
  path: string;
  /** Full file content. */
  content: string;
}

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
  /** Skill files, relative to the workspace root. */
  skills: RenderedFile[];
  /** Template files, relative to the core config directory. */
  templates: RenderedFile[];
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
 * @returns Managed blocks, skill files, and template files.
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
    skills: Object.entries(PLATFORM_SKILLS).map(([name, content]) => ({
      path: `${SKILLS_DIR}/${name}/SKILL.md`,
      content,
    })),
    templates: Object.entries(PLATFORM_TEMPLATES).map(([name, content]) => ({
      path: `${TEMPLATES_DIR}/${name}`,
      content,
    })),
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
