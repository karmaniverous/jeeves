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

import agentsSectionContent from '../../content/agents-section.md';
import soulSectionContent from '../../content/soul-section.md';
import toolsPlatformTemplate from '../../content/tools-platform.md';
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
  /** Component plugin version (e.g., '0.2.0'). */
  componentVersion?: string;
  /** npm package name for the service (for registry update check). */
  servicePackage?: string;
  /** npm package name for the plugin (for registry update check). */
  pluginPackage?: string;
  /** Staleness threshold override in ms. */
  stalenessThresholdMs?: number;
  /** Timeout for health probes in ms. */
  probeTimeoutMs?: number;
  /** Skip registry version check (useful for testing). */
  skipRegistryCheck?: boolean;
}

/** Per-service row data for the Platform template. */
interface ServiceRow extends ProbeResult {
  /** Plugin version for this component. */
  pluginVersion?: string;
  /** Available service update from npm registry. */
  availableServiceVersion?: string;
  /** Available plugin update from npm registry. */
  availablePluginVersion?: string;
}

/** Data passed to the Handlebars Platform template. */
interface PlatformTemplateData {
  services: ServiceRow[];
  unhealthyServices: ProbeResult[];
  coreVersion: string;
  availableCoreVersion?: string;
  templatesAvailable: boolean;
  templatePath: string;
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
    componentVersion,
    servicePackage,
    pluginPackage,
    stalenessThresholdMs,
    probeTimeoutMs = 3000,
    skipRegistryCheck = false,
  } = options;

  const workspacePath = getWorkspacePath();
  const coreConfigDir = getCoreConfigDir();

  // 1. Probe all services
  const probeResults = await probeAllServices(undefined, probeTimeoutMs);
  const unhealthyServices = probeResults.filter((r) => !r.healthy);

  // 2. Registry version checks
  const cacheDir = componentName
    ? getComponentConfigDir(componentName)
    : coreConfigDir;

  let availableCoreVersion: string | undefined;
  let availableServiceVersion: string | undefined;
  let availablePluginVersion: string | undefined;

  if (!skipRegistryCheck) {
    const coreRegistryVersion = checkRegistryVersion(
      '@karmaniverous/jeeves',
      cacheDir,
    );
    if (coreRegistryVersion && coreRegistryVersion !== coreVersion) {
      availableCoreVersion = coreRegistryVersion;
    }

    if (servicePackage) {
      const svcVersion = checkRegistryVersion(servicePackage, cacheDir);
      if (svcVersion) {
        availableServiceVersion = svcVersion;
      }
    }

    if (pluginPackage) {
      const plgVersion = checkRegistryVersion(pluginPackage, cacheDir);
      if (plgVersion) {
        availablePluginVersion = plgVersion;
      }
    }
  }

  // 3. Build enriched service rows — match the calling component by name
  const serviceRows: ServiceRow[] = probeResults.map((r) => ({
    ...r,
    pluginVersion: r.name === componentName ? componentVersion : undefined,
    availableServiceVersion:
      r.name === componentName ? availableServiceVersion : undefined,
    availablePluginVersion:
      r.name === componentName ? availablePluginVersion : undefined,
  }));

  // 5. Check if templates are available
  const templatePath = join(coreConfigDir, TEMPLATES_DIR);
  const templatesAvailable = existsSync(templatePath);

  // 6. Render Platform template
  registerHelpers();
  const template = Handlebars.compile(toolsPlatformTemplate);
  const templateData: PlatformTemplateData = {
    services: serviceRows,
    unhealthyServices,
    coreVersion,
    availableCoreVersion,
    templatesAvailable,
    templatePath,
  };
  const platformContent = template(templateData);

  // 7. Write TOOLS.md Platform section
  const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);
  await updateManagedSection(toolsPath, platformContent, {
    mode: 'section',
    sectionId: 'Platform',
    markers: TOOLS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 8. Write SOUL.md managed block
  const soulPath = join(workspacePath, WORKSPACE_FILES.soul);
  await updateManagedSection(soulPath, soulSectionContent, {
    mode: 'block',
    markers: SOUL_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 9. Write AGENTS.md managed block
  const agentsPath = join(workspacePath, WORKSPACE_FILES.agents);
  await updateManagedSection(agentsPath, agentsSectionContent, {
    mode: 'block',
    markers: AGENTS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 10. Copy templates to config dir
  copyTemplates(coreConfigDir);
}
