/**
 * Internal function to maintain SOUL.md, AGENTS.md, and TOOLS.md Platform section.
 *
 * @remarks
 * Called by `ComponentWriter` on each cycle. Not directly exposed to components.
 * Reads content files from the package's `content/` directory, renders the
 * Platform template with live data, and writes managed sections using
 * `updateManagedSection`.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Handlebars from 'handlebars';
import { packageDirectorySync } from 'package-directory';

import agentsSectionContent from '../../content/agents-section.md';
import soulSectionContent from '../../content/soul-section.md';
import toolsPlatformTemplate from '../../content/tools-platform.md';
import { writeComponentVersion } from '../component/componentVersions.js';
import { loadWorkspaceConfig } from '../config/workspaceConfig.js';
import {
  AGENTS_MARKERS,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
  WORKSPACE_FILES,
} from '../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../init.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';

/** Options for refreshPlatformContent. */
export interface RefreshPlatformContentOptions {
  /** Core library version for version-stamp convergence. */
  coreVersion: string;
  /** Component name (for registry cache directory). */
  componentName?: string;
  /** Component plugin version (e.g., '0.2.0'). */
  componentVersion?: string;
  /** npm package name for the service (for registry update check). */
  servicePackage?: string;
  /** npm package name for the plugin (for registry update check). */
  pluginPackage?: string;
  /** Staleness threshold override in ms. */
  stalenessThresholdMs?: number;
}

/** Compiled Handlebars template for the Platform section (cached at module level). */
const compiledPlatformTemplate = Handlebars.compile(toolsPlatformTemplate, {
  noEscape: true,
});

/** Template context for the Platform section. */
interface PlatformTemplateContext {
  templatePath?: string;
  devRepos?: Record<string, string>;
}

/**
 * Resolve the package's content directory for template file copying.
 *
 * @remarks
 * Templates are actual files that need to be copied to the config directory.
 * This only works when core is in `node_modules` (CLI install, service).
 * When bundled into a consumer plugin, returns undefined and template
 * copying is skipped (templates are seeded by `jeeves install`, not plugins).
 *
 * Content `.md` files (soul, agents, platform template) are inlined at
 * build time via the rollup md plugin and imported as string literals.
 * They do not use this function.
 *
 * @returns Absolute path to the content/ directory, or undefined.
 */
function getContentDir(): string | undefined {
  const pkgDir = packageDirectorySync({
    cwd: fileURLToPath(import.meta.url),
  });
  if (!pkgDir) return undefined;
  const dir = join(pkgDir, 'content');
  return existsSync(dir) ? dir : undefined;
}

/**
 * Copy templates from content/templates/ to the core config directory.
 *
 * @param coreConfigDir - Core config directory path.
 */
function copyTemplates(coreConfigDir: string): void {
  const contentDir = getContentDir();
  if (!contentDir) return;
  const sourceDir = join(contentDir, 'templates');
  if (!existsSync(sourceDir)) return;

  const destDir = join(coreConfigDir, TEMPLATES_DIR);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  cpSync(sourceDir, destDir, { recursive: true });
}

/**
 * Render the Platform template using Handlebars.
 *
 * @param context - Template context with optional templatePath and devRepos.
 * @returns Rendered platform content string.
 */
function renderPlatformTemplate(context: PlatformTemplateContext): string {
  return compiledPlatformTemplate(context);
}

/**
 * Refresh platform content: SOUL.md, AGENTS.md, and TOOLS.md Platform section.
 *
 * @param options - Configuration for the refresh cycle.
 */
export async function refreshPlatformContent(
  options: RefreshPlatformContentOptions,
): Promise<void> {
  const {
    coreVersion,
    componentName,
    componentVersion,
    servicePackage,
    pluginPackage,
    stalenessThresholdMs,
  } = options;

  const workspacePath = getWorkspacePath();
  const coreConfigDir = getCoreConfigDir();

  // 1. Write calling component's version entry
  if (componentName) {
    writeComponentVersion(coreConfigDir, {
      componentName,
      pluginVersion: componentVersion,
      servicePackage,
      pluginPackage,
    });
  }

  // 2. Render Platform template
  const templatePath = join(coreConfigDir, TEMPLATES_DIR);
  const wsConfig = loadWorkspaceConfig(workspacePath);
  const platformContent = renderPlatformTemplate({
    templatePath: existsSync(templatePath) ? templatePath : undefined,
    devRepos: wsConfig?.core?.devRepos,
  });

  // 3. Write TOOLS.md Platform section
  const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);
  await updateManagedSection(toolsPath, platformContent, {
    mode: 'section',
    sectionId: 'Platform',
    markers: TOOLS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 4. Write SOUL.md managed block
  const soulPath = join(workspacePath, WORKSPACE_FILES.soul);
  await updateManagedSection(soulPath, soulSectionContent, {
    mode: 'block',
    markers: SOUL_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 5. Write AGENTS.md managed block
  const agentsPath = join(workspacePath, WORKSPACE_FILES.agents);
  await updateManagedSection(agentsPath, agentsSectionContent, {
    mode: 'block',
    markers: AGENTS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 6. Copy templates to config dir
  copyTemplates(coreConfigDir);
}
