/**
 * Internal function to maintain SOUL.md, AGENTS.md, and TOOLS.md Platform section.
 *
 * @remarks
 * Called by `ComponentWriter` on each cycle. Not directly exposed to components.
 * Probes service ports for health, reads content files from the package's
 * `content/` directory, renders the Platform template with live service data,
 * and writes managed sections using `updateManagedSection`.
 */

import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Handlebars from 'handlebars';

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
 * Resolve the package's content directory.
 *
 * @returns Absolute path to the content/ directory.
 */
function getContentDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // From src/platform/refreshPlatformContent.ts → ../../content/
  // From dist/platform/refreshPlatformContent.js → ../../content/
  return join(dirname(thisFile), '..', '..', 'content');
}

/**
 * Read a content file from the package's content/ directory.
 *
 * @param fileName - File name within content/.
 * @returns File content as string, or empty string if missing.
 */
function readContentFile(fileName: string): string {
  const filePath = join(getContentDir(), fileName);
  if (!existsSync(filePath)) {
    console.warn(`jeeves-core: content file missing: ${filePath}`);
    return '';
  }
  return readFileSync(filePath, 'utf-8');
}

/**
 * Copy templates from content/templates/ to the core config directory.
 *
 * @param coreConfigDir - Core config directory path.
 */
function copyTemplates(coreConfigDir: string): void {
  const sourceDir = join(getContentDir(), 'templates');
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
  const templateSrc = readContentFile('tools-platform.md');
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
  const soulContent = readContentFile('soul-section.md');
  const soulPath = join(workspacePath, WORKSPACE_FILES.soul);
  await updateManagedSection(soulPath, soulContent, {
    mode: 'block',
    markers: SOUL_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 7. Write AGENTS.md managed block
  const agentsContent = readContentFile('agents-section.md');
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
