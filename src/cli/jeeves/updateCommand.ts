/**
 * CLI update command: update installed Jeeves plugins (or named ones) to a
 * version, range, or `latest`, through the OpenClaw CLI, and fill in their
 * missing plugin config.
 *
 * @remarks
 * Same code path as `jeeves install` (resolve exact version → skip if already
 * installed at it, unless `--force-reinstall` →
 * `openclaw plugins install … --pin --accept-capabilities --force` → legacy
 * cleanup → one `config set --batch-file` with hook access and plugin
 * config). Plugin config uses the same options and precedence as
 * `jeeves install`: missing required/defaultable values are filled in,
 * existing values are kept unless passed explicitly, and missing required
 * values fail before anything changes. Does not touch workspace content.
 * Only Jeeves OpenClaw plugin packages are accepted.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { resolveCliConfig } from './cliDefaults.js';
import {
  DRY_RUN_COMPLETE,
  installNotices,
  printLines,
  RESTART_NOTICE,
} from './cliOutput.js';
import {
  addPluginOptions,
  installOptionsFromCli,
  pluginCliOptionsSchema,
} from './plugins/pluginConfigCli.js';
import { createPluginWorkflowDeps } from './plugins/pluginDeps.js';
import { parsePluginSpecs } from './plugins/pluginSpec.js';
import { installPlugins, selectUpdateTargets } from './plugins/workflows.js';

/**
 * Register the update subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerUpdateCommand(program: Command): void {
  const command = program
    .command('update')
    .description(
      'Update Jeeves component plugins via the OpenClaw CLI and fill in missing plugin config',
    )
    .argument(
      '[packages...]',
      'Plugin specs, e.g. @karmaniverous/jeeves-runner-openclaw@1.0.1 or runner@^1 (default: every installed Jeeves plugin at latest)',
    );
  addPluginOptions(command);
  command
    .option(
      '--dry-run',
      'Print plugin config and the exact openclaw commands; change nothing',
    )
    .action(async (packages, rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
      const opts = pluginCliOptionsSchema.parse(rawOpts);
      const specs = parsePluginSpecs(packages);
      const installOptions = installOptionsFromCli(
        opts,
        resolveCliConfig(opts).core.configRoot,
      );
      const deps = createPluginWorkflowDeps(dryRun);
      const targets = await selectUpdateTargets(deps, specs);
      const prepared = await installPlugins(deps, targets, installOptions);
      console.log();
      printLines(installNotices(prepared, dryRun));
      console.log(
        dryRun
          ? DRY_RUN_COMPLETE
          : prepared.plan.length > 0
            ? `✅ Plugins updated. ${RESTART_NOTICE}`
            : '✅ Plugins already up to date.',
      );
    });
}
