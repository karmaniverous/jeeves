/**
 * CLI uninstall command: remove managed blocks, platform artifacts and the
 * Jeeves plugins.
 *
 * @remarks
 * Removes the managed blocks from SOUL.md and AGENTS.md (and any legacy v0.x
 * TOOLS.md block; nothing writes TOOLS.md any more) and the config schema
 * file. Leaves `skills/` and `jeeves-core/templates/` alone (core writes
 * neither; they ship with jeeves-tools). Then runs
 * `openclaw plugins uninstall <id> --force` for every configured Jeeves
 * plugin (they are useless without the rest of the platform) and repairs the
 * leftovers (see `plugins/workflows.ts`). If OpenClaw is not installed the
 * plugin step is skipped. `--dry-run` prints all of it and changes nothing.
 * Warns if platform services still respond.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { PLATFORM_COMPONENTS } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import {
  DRY_RUN_COMPLETE,
  printLines,
  RESTART_NOTICE,
  runHeaderLines,
} from './cliOutput.js';
import { createPluginWorkflowDeps } from './plugins/pluginDeps.js';
import { uninstallPlugins } from './plugins/workflows.js';
import { probeStatus } from './serviceProbe.js';
import { removePlatformArtifacts } from './uninstallHelpers.js';

/**
 * Names of platform services that still answer `/status`.
 *
 * @returns Component names, in component order.
 */
async function respondingServices(): Promise<string[]> {
  const running: string[] = [];
  for (const name of PLATFORM_COMPONENTS) {
    if ((await probeStatus(name, 2000))?.ok) running.push(name);
  }
  return running;
}

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

      printLines(
        runHeaderLines('Jeeves platform uninstall', resolved.core, dryRun),
      );

      const removed = removePlatformArtifacts(
        getWorkspacePath(),
        getCoreConfigDir(),
        dryRun,
      );
      printLines(removed.map((label) => `  ${mark} ${label}`));
      console.log();

      const plugins = await uninstallPlugins(createPluginWorkflowDeps(dryRun));
      console.log();
      if (!dryRun && plugins.length > 0) console.log(RESTART_NOTICE);

      const running = await respondingServices();
      if (running.length > 0) {
        console.log('⚠️  The following services are still responding:');
        for (const name of running) console.log(`    - ${name}`);
        console.log('   Consider stopping them before fully removing Jeeves.');
        console.log();
      }

      console.log(
        dryRun
          ? DRY_RUN_COMPLETE
          : '✅ Jeeves platform artifacts and plugins removed.',
      );
    });
}
