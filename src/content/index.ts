/**
 * Static platform content (SOUL/AGENTS managed sections, platform skills,
 * templates), budgets, and pure render helpers.
 *
 * @packageDocumentation
 */

export {
  BOOTSTRAP_FILE_MAX_CHARS,
  PLATFORM_CONTENT_TOTAL_BUDGET,
  PLATFORM_SECTION_BUDGETS,
} from './budgets.js';
export {
  PLATFORM_SECTIONS,
  PLATFORM_SKILLS,
  PLATFORM_TEMPLATES,
  type PlatformSection,
  type PlatformSectionId,
} from './platformContent.js';
export {
  type RenderedFile,
  type RenderedPlatformContent,
  renderPlatformContent,
  type RenderPlatformContentOptions,
  upsertPlatformSection,
} from './renderPlatformContent.js';
export {
  type SkillFrontmatter,
  validateSkillFrontmatter,
} from './skillFrontmatter.js';
