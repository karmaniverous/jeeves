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
import semver from 'semver';

import agentsSectionContent from '../../content/agents-section.md';
import soulSectionContent from '../../content/soul-section.md';
import toolsPlatformTemplate from '../../content/tools-platform.md';
import {
  type ComponentVersionEntry,
  readComponentVersions,
  writeComponentVersion,
} from '../component/componentVersions.js';
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

  // 2. Write calling component's version entry (with serviceVersion from probe)
  if (componentName) {
    const callerProbe = probeResults.find((r) => r.name === componentName);
    writeComponentVersion(coreConfigDir, {
      componentName,
      serviceVersion: callerProbe?.version,
      pluginVersion: componentVersion,
      servicePackage,
      pluginPackage,
    });
  }

  // 3. Read all component versions from the shared state file
  const componentVersions = readComponentVersions(coreConfigDir);

  // 4. Registry version checks
  const cacheDir = componentName
    ? getComponentConfigDir(componentName)
    : coreConfigDir;

  let availableCoreVersion: string | undefined;

  if (!skipRegistryCheck) {
    const coreRegistryVersion = checkRegistryVersion(
      '@karmaniverous/jeeves',
      cacheDir,
    );
    if (
      coreRegistryVersion &&
      semver.valid(coreRegistryVersion) &&
      semver.valid(coreVersion) &&
      semver.gt(coreRegistryVersion, coreVersion)
    ) {
      availableCoreVersion = coreRegistryVersion;
    }
  }

  // 5. Build enriched service rows using component versions state
  const versionLookup: Partial<Record<string, ComponentVersionEntry>> =
    componentVersions;
  const serviceRows: ServiceRow[] = probeResults.map((r) => {
    const versionEntry = versionLookup[r.name];
    if (!versionEntry) return { ...r };

    // Check for available updates via registry
    let availableServiceVersion: string | undefined;
    let availablePluginVersion: string | undefined;

    if (!skipRegistryCheck) {
      if (versionEntry.servicePackage) {
        const registryServiceVersion = checkRegistryVersion(
          versionEntry.servicePackage,
          cacheDir,
        );
        if (
          registryServiceVersion &&
          r.version &&
          semver.valid(registryServiceVersion) &&
          semver.valid(r.version) &&
          semver.gt(registryServiceVersion, r.version)
        ) {
          availableServiceVersion = registryServiceVersion;
        }
      }

      if (versionEntry.pluginPackage && versionEntry.pluginVersion) {
        const registryPluginVersion = checkRegistryVersion(
          versionEntry.pluginPackage,
          cacheDir,
        );
        if (
          registryPluginVersion &&
          semver.valid(registryPluginVersion) &&
          semver.valid(versionEntry.pluginVersion) &&
          semver.gt(registryPluginVersion, versionEntry.pluginVersion)
        ) {
          availablePluginVersion = registryPluginVersion;
        }
      }
    }

    return {
      ...r,
      pluginVersion: versionEntry.pluginVersion,
      availableServiceVersion,
      availablePluginVersion,
    };
  });

  // 6. Check if templates are available
  const templatePath = join(coreConfigDir, TEMPLATES_DIR);
  const templatesAvailable = existsSync(templatePath);

  // 7. Render Platform template
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

  // 8. Write TOOLS.md Platform section
  const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);
  await updateManagedSection(toolsPath, platformContent, {
    mode: 'section',
    sectionId: 'Platform',
    markers: TOOLS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 9. Write SOUL.md managed block
  const soulPath = join(workspacePath, WORKSPACE_FILES.soul);
  await updateManagedSection(soulPath, soulSectionContent, {
    mode: 'block',
    markers: SOUL_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 10. Write AGENTS.md managed block
  const agentsPath = join(workspacePath, WORKSPACE_FILES.agents);
  await updateManagedSection(agentsPath, agentsSectionContent, {
    mode: 'block',
    markers: AGENTS_MARKERS,
    coreVersion,
    stalenessThresholdMs,
  });

  // 11. Copy templates to config dir
  copyTemplates(coreConfigDir);
}
