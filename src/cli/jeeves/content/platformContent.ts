/**
 * Static Jeeves platform content as pure data (internal to the jeeves CLI):
 * the SOUL/AGENTS managed-section bodies (no skills, no templates).
 *
 * @remarks
 * Markdown sources live in the package's `content/` directory and are
 * inlined into the CLI bundle at build time (rollup md plugin). Not part of
 * the library API: `jeeves install` is the sole writer of this content.
 * The spec templates ship with the jeeves-coding skill in jeeves-tools.
 * No I/O.
 *
 * @module
 */

import agentsSection from '../../../../content/agents-section.md';
import soulSection from '../../../../content/soul-section.md';
import {
  AGENTS_MARKERS,
  type ManagedMarkers,
  SOUL_MARKERS,
} from '../../../constants/markers.js';
import { WORKSPACE_FILES } from '../../../constants/paths.js';

/** A managed section rendered into a workspace bootstrap file. */
export interface PlatformSection {
  /** Workspace-relative file name (e.g. `SOUL.md`). */
  file: string;
  /** Marker set delimiting the managed block. */
  markers: ManagedMarkers;
  /** Managed body (Markdown, without markers or H1 title). */
  body: string;
}

/** Identifier of a platform managed section. */
export type PlatformSectionId = 'soul' | 'agents';

/** The SOUL.md and AGENTS.md managed sections. */
export const PLATFORM_SECTIONS: Readonly<
  Record<PlatformSectionId, PlatformSection>
> = {
  soul: {
    file: WORKSPACE_FILES.soul,
    markers: SOUL_MARKERS,
    body: soulSection,
  },
  agents: {
    file: WORKSPACE_FILES.agents,
    markers: AGENTS_MARKERS,
    body: agentsSection,
  },
};
