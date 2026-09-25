/**
 * CLI uninstall command: remove managed blocks and platform artifacts.
 *
 * @remarks
 * Removes the managed blocks from SOUL.md and AGENTS.md (and any legacy v0.x
 * TOOLS.md block). Removes templates and the config schema file. Warns if
 * platform services are still responding.
 */

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import type { Command } from '@commander-js/extra-typings';

import {
  AGENTS_MARKERS,
  LEGACY_TOOLS_MARKERS,
  PLATFORM_COMPONENTS,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  WORKSPACE_FILES,
} from '../../constants/index.js';
import { getServiceUrl } from '../../discovery/getServiceUrl.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { fetchWithTimeout } from '../../plugin/http.js';
import { initFromOptions } from './cliDefaults.js';
import { removeManagedBlockFromFile } from './uninstallHelpers.js';

/**
 * Register the uninstall subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description('Remove Jeeves managed sections and platform artifacts')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action(async (opts) => {
      const resolved = initFromOptions(opts);

      console.log('Jeeves platform uninstall');
      console.log(`  Workspace: ${resolved.core.workspace.value}`);
      console.log(`  Config root: ${resolved.core.configRoot.value}`);
      console.log();

      const wsPath = getWorkspacePath();
      const coreConfigDir = getCoreConfigDir();

      // Remove managed blocks from workspace files
      const targets = [
        [WORKSPACE_FILES.soul, SOUL_MARKERS],
        [WORKSPACE_FILES.agents, AGENTS_MARKERS],
        [WORKSPACE_FILES.legacyTools, LEGACY_TOOLS_MARKERS],
      ] as const;
      for (const [file, markers] of targets) {
        if (removeManagedBlockFromFile(join(wsPath, file), markers)) {
          console.log(`  ✓ ${file} managed block removed`);
        }
      }

      // Remove templates directory
      const templatesDir = join(coreConfigDir, TEMPLATES_DIR);
      if (existsSync(templatesDir)) {
        rmSync(templatesDir, { recursive: true, force: true });
        console.log('  ✓ Templates removed');
      }

      // Remove config schema file
      const schemaPath = join(coreConfigDir, 'config.schema.json');
      if (existsSync(schemaPath)) {
        rmSync(schemaPath);
        console.log('  ✓ Config schema removed');
      }

      console.log();

      // Warn if services still responding
      try {
        const running: string[] = [];

        for (const name of PLATFORM_COMPONENTS) {
          try {
            const url = getServiceUrl(name);
            const response = await fetchWithTimeout(`${url}/status`, 2000);
            if (response.ok) {
              running.push(name);
            }
          } catch {
            // Not running — expected during uninstall
          }
        }

        if (running.length > 0) {
          console.log('⚠️  The following services are still responding:');
          for (const name of running) {
            console.log(`    - ${name}`);
          }
          console.log(
            '   Consider stopping them before fully removing Jeeves.',
          );
          console.log();
        }
      } catch {
        // Probe failure is non-fatal during uninstall
      }

      console.log('✅ Jeeves platform artifacts removed.');
    });
}
