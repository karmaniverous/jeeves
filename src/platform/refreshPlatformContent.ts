/**
 * Internal function to maintain SOUL.md, AGENTS.md, and TOOLS.md Platform section.
 *
 * @remarks
 * Called by `ComponentWriter` on each cycle. Not directly exposed to components.
 * Probes service ports for health, reads content files from the package's
 * `content/` directory, renders the Platform template with live service data,
 * and writes managed sections using `updateManagedSection`.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Handlebars from 'handlebars';
import { packageDirectorySync } from 'package-directory';

// Content files inlined at build time via rollup-plugin-md.
// This eliminates runtime filesystem dependencies when bundled into consumers.
import agentsSectionContent from '../../content/agents-section.md';
import soulSectionContent from '../../content/soul-section.md';
import toolsPlatformContent from '../../content/tools-platform.md';
import {
  AGENTS_MARKERS,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
  WORKSPACE_FILES,
} from '../constants/index.js';
import { probeAllServices, type ProbeResult } from '../discovery/probe.js';
import { checkRegistryVersion } from '../discovery/registry.js';
import {
  getComponentConfigDir,
  getCoreConfigDir,
  getWorkspacePath,
} from '../init.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';

/** Options for refreshPlatformContent. */
export interface RefreshPlatformContentOptions {
  /** Core library version for version-stamp convergence. */
  coreVersion: string;
  /** Component name (for registry cache directory). */
  componentName?: string;
  /** Staleness threshold override in ms. */
  stalenessThresholdMs?: number;
  /** Timeout for health probes in ms. */
  probeTimeoutMs?: number;
  /** Skip registry version check (useful for testing). */
  skipRegistryCheck?: boolean;
}

/** Data passed to the Handlebars Platform template. */
interface PlatformTemplateData {
  services: ProbeResult[];
  unhealthyServices: ProbeResult[];
  versionInfo?: VersionInfoEntry[];
  pointCount?: number;
  templatesAvailable: boolean;
  templatePath: string;
}

/** Version information for a component. */
interface VersionInfoEntry {
  name: string;
  serviceVersion?: string;
  pluginVersion?: string;
  coreVersion: string;
  availableVersion?: string;
}

/**
 * Resolve the package's content directory for template copying.
 *
 * @remarks
 * Templates are actual files that need to be copied to the config directory.
 * This resolution works when core is in `node_modules` (CLI install, service).
 * When bundled into a consumer plugin, this returns undefined and template
 * copying is skipped (templates are only needed for the CLI `jeeves install`).
 *
 * @returns Absolute path to the content/ directory, or undefined if not found.
 */
function getContentDir(): string | undefined {
  const pkgDir = packageDirectorySync({
    cwd: fileURLToPath(import.meta.url),
  });
  if (!pkgDir) return undefined;
  const contentDir = join(pkgDir, 'content');
  return existsSync(contentDir) ? contentDir : undefined;
}

/**
 * Copy templates from content/templates/ to the core config directory.
 *
 * @remarks
 * This is best-effort: when core is bundled into a consumer plugin,
 * the content directory isn't available and copying is silently skipped.
 * Templates are primarily seeded by `jeeves install` (CLI), not by
 * plugin writer cycles.
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

/** Whether Handlebars helpers have been registered. */
let helpersRegistered = false;

/**
 * Register Handlebars helpers used in the Platform template.
 */
function registerHelpers(): void {
  if (helpersRegistered) return;
  helpersRegistered = true;

  Handlebars.registerHelper(
    'gt',
    (a: unknown, b: unknown) =>
      typeof a === 'number' && typeof b === 'number' && a > b,
  );
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
    stalenessThresholdMs,
    probeTimeoutMs = 3000,
    skipRegistryCheck = false,
  } = options;

  const workspacePath = getWorkspacePath();
  const coreConfigDir = getCoreConfigDir();

  // 1. Probe all services
  const probeResults = await probeAllServices(undefined, probeTimeoutMs);
  const unhealthyServices = probeResults.filter((r) => !r.healthy);

  // 2. Build version info (registry check for the core package)
  let availableVersion: string | undefined;
  if (!skipRegistryCheck) {
    const cacheDir = componentName
      ? getComponentConfigDir(componentName)
      : coreConfigDir;
    availableVersion = checkRegistryVersion('@karmaniverous/jeeves', cacheDir);
  }

  const versionInfo: VersionInfoEntry[] = probeResults.map((r) => ({
    name: r.name,
    serviceVersion: r.version,
    coreVersion,
    availableVersion:
      availableVersion && availableVersion !== coreVersion
        ? availableVersion
        : undefined,
  }));

  // 3. Check if templates are available
  const templatePath = join(coreConfigDir, TEMPLATES_DIR);
  const templatesAvailable = existsSync(templatePath);

  // 4. Render Platform template
  registerHelpers();
  const templateSrc = toolsPlatformContent;
  const template = Handlebars.compile(templateSrc);
  const templateData: PlatformTemplateData = {
    services: probeResults,
    unhealthyServices,
    versionInfo: versionInfo.some((v) => v.serviceVersion)
      ? versionInfo
      : undefined,
    templatesAvailable,
    templatePath,
  };
  const platformContent = template(templateData);

  // 5. Write TOOLS.md Platform section
  const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);
  await updateManagedSection(toolsPath, platformContent, {
    mode: 'section',
    sectionId: 'Platform',
    markers: TOOLS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 6. Write SOUL.md managed block
  const soulContent = soulSectionContent;
  const soulPath = join(workspacePath, WORKSPACE_FILES.soul);
  await updateManagedSection(soulPath, soulContent, {
    mode: 'block',
    markers: SOUL_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 7. Write AGENTS.md managed block
  const agentsContent = agentsSectionContent;
  const agentsPath = join(workspacePath, WORKSPACE_FILES.agents);
  await updateManagedSection(agentsPath, agentsContent, {
    mode: 'block',
    markers: AGENTS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 8. Copy templates to config dir
  copyTemplates(coreConfigDir);
}
