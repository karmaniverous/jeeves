/**
 * CLI uninstall command: remove managed blocks, platform artifacts and the
 * Jeeves plugins.
 *
 * @remarks
 * Removes the managed blocks from SOUL.md and AGENTS.md (and any legacy v0.x
 * TOOLS.md block; nothing writes TOOLS.md any more). Removes templates and
 * the config schema file. Then runs
 * `openclaw plugins uninstall <id> --force` for every configured Jeeves
 * plugin (they are useless without the rest of the platform) and repairs the
 * leftovers (see `plugins/workflows.ts`). If OpenClaw is not installed the
 * plugin step is skipped. `--dry-run` prints all of it and changes nothing.
 * Warns if platform services still respond.
 *
 * @module
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
import {
  createPluginWorkflowDeps,
  RESTART_NOTICE,
} from './plugins/pluginDeps.js';
import { uninstallPlugins } from './plugins/workflows.js';
import { removeManagedBlockFromFile } from './uninstallHelpers.js';

/**
 * Register the uninstall subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerUninstallCommand(program: Command): void {
  program
    .command('uninstall')
    .description(
      'Remove Jeeves managed sections, platform artifacts and the Jeeves plugins',
    )
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .option(
      '--dry-run',
      'Print what would be removed, including the exact openclaw commands; change nothing',
    )
    .action(async (opts) => {
      const dryRun = opts.dryRun === true;
      const resolved = initFromOptions(opts);
      const mark = dryRun ? '[dry-run] would remove' : '✓ removed';

      console.log(
        `Jeeves platform uninstall${dryRun ? ' [dry run: no changes]' : ''}`,
      );
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
        if (removeManagedBlockFromFile(join(wsPath, file), markers, dryRun)) {
          console.log(`  ${mark} ${file} managed block`);
        }
      }

      // Remove templates directory
      const templatesDir = join(coreConfigDir, TEMPLATES_DIR);
      if (existsSync(templatesDir)) {
        if (!dryRun) rmSync(templatesDir, { recursive: true, force: true });
        console.log(`  ${mark} templates`);
      }

      // Remove config schema file
      const schemaPath = join(coreConfigDir, 'config.schema.json');
      if (existsSync(schemaPath)) {
        if (!dryRun) rmSync(schemaPath);
        console.log(`  ${mark} config schema`);
      }

      console.log();

      const removed = await uninstallPlugins(createPluginWorkflowDeps(dryRun));
      console.log();
      if (!dryRun && removed.length > 0) console.log(RESTART_NOTICE);

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

      console.log(
        dryRun
          ? 'Dry run complete. Nothing was changed.'
          : '✅ Jeeves platform artifacts and plugins removed.',
      );
    });
}
