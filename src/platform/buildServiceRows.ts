/**
 * Build enriched service rows for the Platform template.
 *
 * @remarks
 * Merges health probe results with component version state and
 * npm registry update availability into rows for the Handlebars
 * Platform template.
 */

import semver from 'semver';

import type { ComponentVersionEntry } from '../component/componentVersions.js';
import type { ProbeResult } from '../discovery/probe.js';
import { checkRegistryVersion } from '../discovery/registry.js';

/** Per-service row data for the Platform template. */
export interface ServiceRow extends ProbeResult {
  /** Plugin version for this component. */
  pluginVersion?: string;
  /** Available service update from npm registry. */
  availableServiceVersion?: string;
  /** Available plugin update from npm registry. */
  availablePluginVersion?: string;
}

/** Options for building service rows. */
export interface BuildServiceRowsOptions {
  /** Health probe results for all services. */
  probeResults: ProbeResult[];
  /** Component version entries keyed by component name. */
  componentVersions: Partial<Record<string, ComponentVersionEntry>>;
  /** Directory path for caching registry lookups. */
  cacheDir: string;
  /** Skip npm registry version checks. */
  skipRegistryCheck: boolean;
}

/**
 * Check whether an available version is newer than the current one.
 *
 * @param available - Registry version string.
 * @param current - Currently installed version string.
 * @returns The available version if it's newer, otherwise undefined.
 */
function newerVersion(
  available: string | undefined,
  current: string | undefined,
): string | undefined {
  if (
    !available ||
    !current ||
    !semver.valid(available) ||
    !semver.valid(current)
  ) {
    return undefined;
  }
  return semver.gt(available, current) ? available : undefined;
}

/**
 * Build enriched service rows for the Platform Handlebars template.
 *
 * @param options - Probe results, version state, and configuration.
 * @returns Array of enriched service rows.
 */
export function buildServiceRows(
  options: BuildServiceRowsOptions,
): ServiceRow[] {
  const { probeResults, componentVersions, cacheDir, skipRegistryCheck } =
    options;

  return probeResults.map((r) => {
    const entry = componentVersions[r.name];
    if (!entry) return { ...r };

    let availableServiceVersion: string | undefined;
    let availablePluginVersion: string | undefined;

    if (!skipRegistryCheck) {
      if (entry.servicePackage) {
        const registryVersion = checkRegistryVersion(
          entry.servicePackage,
          cacheDir,
        );
        availableServiceVersion = newerVersion(registryVersion, r.version);
      }

      if (entry.pluginPackage && entry.pluginVersion) {
        const registryVersion = checkRegistryVersion(
          entry.pluginPackage,
          cacheDir,
        );
        availablePluginVersion = newerVersion(
          registryVersion,
          entry.pluginVersion,
        );
      }
    }

    return {
      ...r,
      pluginVersion: entry.pluginVersion,
      availableServiceVersion,
      availablePluginVersion,
    };
  });
}
