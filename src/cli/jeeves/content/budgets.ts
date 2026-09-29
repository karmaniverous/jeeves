/**
 * Character budgets for the static platform content rendered into workspace
 * bootstrap files.
 *
 * @remarks
 * OpenClaw injects each workspace bootstrap file (AGENTS.md, SOUL.md, …) into
 * the system prompt truncated at `agents.defaults.bootstrapMaxChars`
 * (default {@link BOOTSTRAP_FILE_MAX_CHARS}). That limit covers the WHOLE file,
 * including the owner's own content outside the Jeeves markers. The budgets
 * below cap each rendered Jeeves managed block (markers and title included)
 * at well under half of the per-file limit, leaving at least 12,500 chars per
 * file for user content. Tests enforce them.
 *
 * @module
 */

import type { PlatformSectionId } from './platformContent.js';

/** OpenClaw's default per-file bootstrap limit (`bootstrapMaxChars`). */
export const BOOTSTRAP_FILE_MAX_CHARS = 20_000;

/** Maximum chars of each rendered managed block, by section. */
export const PLATFORM_SECTION_BUDGETS: Readonly<
  Record<PlatformSectionId, number>
> = {
  soul: 7_500,
  agents: 7_500,
};

/** Maximum chars of all rendered managed blocks combined. */
export const PLATFORM_CONTENT_TOTAL_BUDGET = 15_000;
