/**
 * Static Jeeves platform content as pure data (internal to the jeeves CLI):
 * SOUL/AGENTS managed-section bodies, platform skills, reference templates.
 *
 * @remarks
 * Markdown sources live in the package's `content/` directory and are
 * inlined into the CLI bundle at build time (rollup md plugin). Not part of
 * the library API: `jeeves install` is the sole writer of this content.
 * No I/O.
 *
 * @module
 */

import agentsSection from '../../../../content/agents-section.md';
import codingSkill from '../../../../content/skills/coding.md';
import jeevesSkill from '../../../../content/skills/jeeves.md';
import operationsSkill from '../../../../content/skills/operations.md';
import playbooksSkill from '../../../../content/skills/playbooks.md';
import slackBotProvisionerSkill from '../../../../content/skills/slack-bot-provisioner.md';
import soulSection from '../../../../content/soul-section.md';
import specTemplate from '../../../../content/templates/spec.md';
import specToCodeGuideTemplate from '../../../../content/templates/spec-to-code-guide.md';
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

/**
 * Platform skills keyed by skill directory name. Each value is a complete
 * `SKILL.md` including `name`/`description` frontmatter.
 */
export const PLATFORM_SKILLS: Readonly<Record<string, string>> = {
  jeeves: jeevesSkill,
  coding: codingSkill,
  operations: operationsSkill,
  playbooks: playbooksSkill,
  'slack-bot-provisioner': slackBotProvisionerSkill,
};

/** Reference templates keyed by file name. */
export const PLATFORM_TEMPLATES: Readonly<Record<string, string>> = {
  'spec.md': specTemplate,
  'spec-to-code-guide.md': specToCodeGuideTemplate,
};
