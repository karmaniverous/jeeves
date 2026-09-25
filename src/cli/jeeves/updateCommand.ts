/**
 * CLI update command: update installed Jeeves plugins (or named ones) to a
 * version, range, or `latest`, through the OpenClaw CLI.
 *
 * @remarks
 * Same code path as `jeeves install` (resolve exact version →
 * `openclaw plugins install … --pin --accept-capabilities --force` → legacy
 * cleanup → hook access). Does not touch workspace content. Only Jeeves
 * OpenClaw plugin packages are accepted.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import {
  createPluginWorkflowDeps,
  RESTART_NOTICE,
} from './plugins/pluginDeps.js';
import { parsePluginSpecs } from './plugins/pluginSpec.js';
import { installPlugins, selectUpdateTargets } from './plugins/workflows.js';

/**
 * Register the update subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update Jeeves component plugins via the OpenClaw CLI')
    .argument(
      '[packages...]',
      'Plugin specs, e.g. @karmaniverous/jeeves-runner-openclaw@1.0.1 or runner@^1 (default: every installed Jeeves plugin at latest)',
    )
    .option(
      '--dry-run',
      'Print the exact openclaw commands and config changes; change nothing',
    )
    .action(async (packages, opts) => {
      const dryRun = opts.dryRun === true;
      const deps = createPluginWorkflowDeps(dryRun);
      const targets = await selectUpdateTargets(
        deps,
        parsePluginSpecs(packages),
      );
      await installPlugins(deps, targets);
      console.log();
      console.log(
        dryRun
          ? 'Dry run complete. Nothing was changed.'
          : `✅ Plugins updated. ${RESTART_NOTICE}`,
      );
    });
}
