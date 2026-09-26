/**
 * Filesystem adapter that writes rendered platform content to a workspace
 * (`jeeves install` is the only writer). Supports a no-write dry run.
 *
 * @remarks
 * Thin I/O boundary over the pure {@link renderPlatformContent} /
 * {@link upsertPlatformSection} functions. Synchronous; writes only under the
 * given workspace and core config directories. Never writes or deletes
 * anything under the workspace `skills/` directory or the core config
 * `templates/` directory (skills and spec templates ship with jeeves-tools).
 *
 * @module
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CONFIG_FILE } from '../../constants/index.js';
import {
  coreConfigSchema,
  generateJsonSchema,
} from '../../discovery/config.js';
import { atomicWrite } from '../../managed/fileOps.js';
import type { PlatformSectionId } from './content/platformContent.js';
import {
  renderPlatformContent,
  upsertPlatformSection,
} from './content/renderPlatformContent.js';

/** Options for {@link installPlatformContent}. */
export interface InstallPlatformContentOptions {
  /** Workspace root. */
  workspacePath: string;
  /** Core config directory (`{configRoot}/jeeves-core`). */
  coreConfigDir: string;
  /** Version written into managed-block stamps. */
  version: string;
  /** Report what would be written without touching the filesystem. */
  dryRun?: boolean;
}

/** Write a file, creating parent directories. */
function writeWithDirs(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  atomicWrite(filePath, content);
}

/** Create the core config (with JSON schema) if it does not exist. */
function ensureCoreConfig(coreConfigDir: string, dryRun: boolean): boolean {
  const configPath = join(coreConfigDir, CONFIG_FILE);
  if (existsSync(configPath)) return false;
  if (dryRun) return true;
  mkdirSync(coreConfigDir, { recursive: true });
  const config = {
    $schema: './config.schema.json',
    ...coreConfigSchema.parse({}),
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  writeFileSync(
    join(coreConfigDir, 'config.schema.json'),
    JSON.stringify(generateJsonSchema(), null, 2),
    'utf-8',
  );
  return true;
}

/**
 * Render and write all static platform content.
 *
 * @param options - Target directories and stamp version.
 * @returns Human-readable list of what was written.
 */
export function installPlatformContent(
  options: InstallPlatformContentOptions,
): string[] {
  const { workspacePath, coreConfigDir, version, dryRun = false } = options;
  const rendered = renderPlatformContent({ version });
  const written: string[] = [];
  const put = (filePath: string, content: string) => {
    if (!dryRun) writeWithDirs(filePath, content);
  };

  for (const id of Object.keys(rendered.sections) as PlatformSectionId[]) {
    const filePath = join(workspacePath, rendered.sections[id].file);
    const existing = existsSync(filePath)
      ? readFileSync(filePath, 'utf-8')
      : '';
    put(filePath, upsertPlatformSection(id, existing, { version }));
    written.push(`${rendered.sections[id].file} managed block`);
  }

  if (ensureCoreConfig(coreConfigDir, dryRun)) {
    written.push('core config (new)');
  }

  return written;
}
