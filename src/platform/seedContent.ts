/**
 * One-shot content seeding used by the CLI install command.
 *
 * @remarks
 * Seeds SOUL.md, AGENTS.md, and TOOLS.md Platform section using the same
 * `updateManagedSection()` code path as writer cycles. Also copies templates
 * and creates core config with defaults if missing.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE, WORKSPACE_FILES } from '../constants/paths.js';
import { PLATFORM_COMPONENTS } from '../constants/sections.js';
import { coreConfigSchema, generateJsonSchema } from '../discovery/config.js';
import { getCoreConfigDir, getWorkspacePath } from '../init.js';
import {
  NOT_INSTALLED_ALERTS,
  toServiceName,
} from '../component/heartbeatOrchestrator.js';
import {
  type HeartbeatEntry,
  writeHeartbeatSection,
} from '../managed/heartbeat.js';
import { refreshPlatformContent } from './refreshPlatformContent.js';

/** Options for seeding content. */
export interface SeedContentOptions {
  /** Core library version for version-stamp convergence. */
  coreVersion: string;
}

/**
 * Create the core config file with defaults if it doesn't already exist.
 *
 * @param coreConfigDir - Path to the core config directory.
 */
function ensureCoreConfig(coreConfigDir: string): void {
  if (!existsSync(coreConfigDir)) {
    mkdirSync(coreConfigDir, { recursive: true });
  }

  const configPath = join(coreConfigDir, CONFIG_FILE);
  if (existsSync(configPath)) return;

  const defaults = coreConfigSchema.parse({});
  const configWithSchema = {
    $schema: './config.schema.json',
    ...defaults,
  };

  writeFileSync(configPath, JSON.stringify(configWithSchema, null, 2), 'utf-8');

  // Write JSON schema file alongside config
  const schemaPath = join(coreConfigDir, 'config.schema.json');
  const jsonSchema = generateJsonSchema();
  writeFileSync(schemaPath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
}

/**
 * Seed all platform content into the workspace.
 *
 * @remarks
 * Uses the same `updateManagedSection()` code path as writer cycles.
 * Creates core config with defaults if missing. Copies templates.
 * Writes initial HEARTBEAT with "Not installed" alerts for all platform components.
 * Jaccard cleanup detection runs automatically via `updateManagedSection`.
 *
 * @param options - Seeding configuration.
 */
export async function seedContent(options: SeedContentOptions): Promise<void> {
  const coreConfigDir = getCoreConfigDir();

  // Ensure core config exists
  ensureCoreConfig(coreConfigDir);

  // Seed SOUL.md, AGENTS.md, TOOLS.md Platform section
  await refreshPlatformContent({
    coreVersion: options.coreVersion,
  });

  // Seed HEARTBEAT.md with "Not installed" alerts for all platform components
  const heartbeatPath = join(getWorkspacePath(), WORKSPACE_FILES.heartbeat);
  const entries: HeartbeatEntry[] = PLATFORM_COMPONENTS.map((name) => ({
    name: toServiceName(name),
    declined: false,
    content: `- ${NOT_INSTALLED_ALERTS[name]}`,
  }));
  await writeHeartbeatSection(heartbeatPath, entries);
}
