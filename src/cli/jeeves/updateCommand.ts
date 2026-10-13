/**
 * CLI update command: update installed Jeeves plugins (or named ones) to a
 * version, range, or `latest`, through the OpenClaw CLI, and fill in their
 * missing plugin config.
 *
 * @remarks
 * Same code path as `jeeves install` (resolve exact version → skip if already
 * installed at it, unless `--force-reinstall` → one `config set --batch-file`
 * with plugin config and hook access →
 * `openclaw plugins install … --pin --accept-capabilities --force` per plugin
 * (gateway settle wait and disconnect recovery) → legacy cleanup). Plugin config uses the same options and precedence as
 * `jeeves install`: missing required/defaultable values are filled in,
 * existing values are kept unless passed explicitly, and missing required
 * values fail before anything changes. Does not touch workspace content.
 * Only Jeeves OpenClaw plugin packages are accepted.
 *
 * After plugins are applied, runs the `patch-openclaw` dist patch step
 * (#121) unless `--skip-patch` is given. If the patch step reports
 * a failure, the command still finishes (plugins stay updated) and exits
 * non-zero. The restart notice folds in both plugin changes needing a
 * restart and a live (non-dry-run) dist patch, printed once.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { resolveCliConfig } from './cliDefaults.js';
import {
  DRY_RUN_COMPLETE,
  gatewayNotice,
  installNotices,
  printLines,
} from './cliOutput.js';
import {
  addPluginOptions,
  installOptionsFromCli,
  pluginCliOptionsSchema,
} from './plugins/pluginConfigCli.js';
import { createPluginWorkflowDeps } from './plugins/pluginDeps.js';
import { parsePluginSpecs } from './plugins/pluginSpec.js';
import { installPlugins, selectUpdateTargets } from './plugins/workflows.js';
import {
  addPostPluginOptions,
  runPostPluginSteps,
  skipPatchFromCli,
} from './postPluginSteps.js';
import { skillsModeFromCli } from './skills/skillsCommand.js';

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
  addPostPluginOptions(
    command,
    'Skills: wire skills/ and skills-self-hosted/ (default: keep the current mode)',
  );
  command
    .option(
      '--dry-run',
      'Print plugin config and the exact openclaw commands; change nothing',
    )
    .action(async (packages, rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
      const skillsMode = skillsModeFromCli(rawOpts);
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

      const post = await runPostPluginSteps({
        dryRun,
        skipPatch: skipPatchFromCli(rawOpts),
        ...(skillsMode ? { skillsMode } : {}),
      });

      printLines(gatewayNotice(prepared.applied, post.distChanged));
      console.log(
        dryRun
          ? DRY_RUN_COMPLETE
          : prepared.plan.length > 0
            ? '✅ Plugins updated.'
            : '✅ Plugins already up to date.',
      );

      if (post.failed) process.exitCode = 1;
    });
}
