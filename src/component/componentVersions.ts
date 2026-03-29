/**
 * Shared component version state file management.
 *
 * @remarks
 * Each `ComponentWriter` cycle writes its component's entry to
 * `{coreConfigDir}/component-versions.json`. The Platform Handlebars
 * template reads this file to populate ALL rows in the service health
 * table, not just the calling component's.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { COMPONENT_VERSIONS_FILE } from '../constants/paths.js';
import { atomicWrite } from '../managed/fileOps.js';

/** Version entry for a single component. */
export interface ComponentVersionEntry {
  /** Plugin version (the OpenClaw plugin package version). */
  pluginVersion?: string;
  /** npm package name for the service. */
  servicePackage?: string;
  /** npm package name for the plugin. */
  pluginPackage?: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
}

/** Shape of the component-versions.json file. */
export type ComponentVersionsState = Record<string, ComponentVersionEntry>;

/**
 * Read the component versions state file.
 *
 * @param coreConfigDir - Path to the core config directory.
 * @returns The parsed state, or an empty object if the file doesn't exist.
 */
export function readComponentVersions(
  coreConfigDir: string,
): ComponentVersionsState {
  const filePath = join(coreConfigDir, COMPONENT_VERSIONS_FILE);
  if (!existsSync(filePath)) return {};

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ComponentVersionsState;
  } catch {
    return {};
  }
}

/** Options for writing a component version entry. */
export interface WriteComponentVersionOptions {
  /** Component name. */
  componentName: string;
  /** Plugin version. */
  pluginVersion?: string;
  /** Service npm package name. */
  servicePackage?: string;
  /** Plugin npm package name. */
  pluginPackage?: string;
}

/**
 * Write a component's version entry to the shared state file.
 *
 * @remarks
 * Reads the existing file, merges the new entry, and writes atomically.
 *
 * @param coreConfigDir - Path to the core config directory.
 * @param options - Component version data to write.
 */
export function writeComponentVersion(
  coreConfigDir: string,
  options: WriteComponentVersionOptions,
): void {
  const existing = readComponentVersions(coreConfigDir);

  existing[options.componentName] = {
    pluginVersion: options.pluginVersion,
    servicePackage: options.servicePackage,
    pluginPackage: options.pluginPackage,
    updatedAt: new Date().toISOString(),
  };

  const filePath = join(coreConfigDir, COMPONENT_VERSIONS_FILE);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  atomicWrite(filePath, JSON.stringify(existing, null, 2) + '\n');
}

/**
 * Remove a component's version entry from the shared state file.
 *
 * @remarks
 * Called during plugin uninstall to prevent the HEARTBEAT writer from
 * probing a service that's intentionally gone. If the component isn't
 * in the file, this is a no-op.
 *
 * @param coreConfigDir - Path to the core config directory.
 * @param componentName - The component name to remove.
 */
export function removeComponentVersion(
  coreConfigDir: string,
  componentName: string,
): void {
  const existing = readComponentVersions(coreConfigDir);

  if (!(componentName in existing)) return;

  const { [componentName]: _, ...updated } = existing;

  const filePath = join(coreConfigDir, COMPONENT_VERSIONS_FILE);
  atomicWrite(filePath, JSON.stringify(updated, null, 2) + '\n');
}
