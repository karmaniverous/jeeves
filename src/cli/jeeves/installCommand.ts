/**
 * CLI install command: render the static platform content, install or
 * update the Jeeves component plugins through the OpenClaw CLI, and write
 * their `plugins.entries.<id>.config`.
 *
 * @remarks
 * Content: SOUL.md/AGENTS.md managed blocks (user content preserved),
 * core config if missing. Never TOOLS.md, HEARTBEAT.md, anything under
 * `skills/` or the spec templates (jeeves-tools ships those). Plugins: one
 * `config set --batch-file` with plugin config and hook access (plugins that
 * declare conversation hooks), then one standard
 * `openclaw plugins install npm:<pkg>\@<ver> --pin --accept-capabilities --force`
 * per plugin that is not already installed at that exact version (unless
 * `--force-reinstall`), each after a running gateway has settled and
 * verified when it loses its gateway connection, then legacy cleanup (see
 * `plugins/workflows.ts`, `plugins/pluginInstallStep.ts`). Plugin
 * config precedence: option \> `--plugin-config` \> existing \> default \>
 * error; required values are checked before anything is written.
 * `--dry-run` prints everything (secrets redacted) and changes nothing. Never
 * restarts the gateway. Idempotent: re-running replaces managed blocks in
 * place and skips plugins that are already current.
 *
 * After plugins are applied, runs the `patch-openclaw` dist patch step
 * (#121) unless `--content-only` or `--skip-patch` is given. If the
 * patch step reports a failure, the command still finishes (content and
 * plugins stay written) and exits non-zero. The restart notice folds in
 * both plugin changes needing a restart and a live (non-dry-run) dist
 * patch, printed once.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import {
  DRY_RUN_COMPLETE,
  gatewayNotice,
  installNotices,
  printLines,
  runHeaderLines,
} from './cliOutput.js';
import {
  bootstrapReportLines,
  DEFAULT_BOOTSTRAP_LIMITS,
  hasBootstrapProblems,
  measureBootstrapFiles,
  readBootstrapLimits,
} from './content/bootstrapReport.js';
import { installPlatformContent } from './installPlatformContent.js';
import { runOpenClawPatches } from './openclawPatch/patchOpenclawCommand.js';
import { emptyApplyReport } from './plugins/applyReport.js';
import { executePlan } from './plugins/executePlan.js';
import {
  addPluginOptions,
  installOptionsFromCli,
  pluginCliOptionsSchema,
} from './plugins/pluginConfigCli.js';
import { createPluginWorkflowDeps } from './plugins/pluginDeps.js';
import {
  defaultPluginTargets,
  parsePluginSpecs,
} from './plugins/pluginSpec.js';
import { prepareInstall } from './plugins/workflows.js';
import { runSkillsCommand } from './skills/skillsCommand.js';
import { resolveModeFlag } from './skills/skillsModel.js';

/**
 * Register the install subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerInstallCommand(program: Command): void {
  const command = program
    .command('install')
    .description(
      'Render Jeeves platform content, install/update the component plugins, and write their config',
    )
    .argument(
      '[plugins...]',
      'Plugin specs, e.g. watcher, watcher@1.2.3 (default: runner, watcher, server, meta at latest)',
    );
  addPluginOptions(command);
  command
    .option('--content-only', 'Render platform content only; skip plugins')
    .option(
      '--skip-patch',
      'Skip the OpenClaw dist patch step (jeeves patch-openclaw)',
    )
    .option(
      '--managed',
      'Skills: wire skills/ only (jeeves skills install --managed)',
    )
    .option(
      '--self-hosted',
      'Skills: wire skills/ and skills-self-hosted/ (default on a fresh install)',
    )
    .option(
      '--strict',
      'Exit non-zero when a bootstrap file is at or over 90% of its OpenClaw limit',
    )
    .option(
      '--dry-run',
      'Print planned file writes, plugin config and exact openclaw commands; change nothing',
    )
    .action(async (plugins, rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
      const skillsMode = resolveModeFlag(
        rawOpts.managed === true,
        rawOpts.selfHosted === true,
      );
      const opts = pluginCliOptionsSchema.parse(rawOpts);
      // Validate specs and config input before writing anything.
      const targets = rawOpts.contentOnly
        ? []
        : plugins.length > 0
          ? parsePluginSpecs(plugins)
          : defaultPluginTargets();
      const resolved = initFromOptions(opts);
      const installOptions = installOptionsFromCli(
        opts,
        resolved.core.configRoot,
      );
      printLines(
        runHeaderLines('Jeeves platform install', resolved.core, dryRun),
      );

      // Read-only: resolves versions and plugin config, fails on missing
      // required config before any content or plugin is written.
      const deps = createPluginWorkflowDeps(dryRun);
      const prepared = await prepareInstall(deps, targets, installOptions);
      if (targets.length > 0) console.log();

      const written = installPlatformContent({
        workspacePath: getWorkspacePath(),
        coreConfigDir: getCoreConfigDir(),
        version: CORE_VERSION,
        dryRun,
      });
      for (const file of written) {
        console.log(`  ${dryRun ? '[dry-run] would write' : '✓'} ${file}`);
      }
      console.log();

      let applied = emptyApplyReport();
      if (targets.length > 0) {
        applied = await executePlan(prepared.plan, deps);
        console.log();
        printLines(installNotices(prepared, dryRun));
      }

      let patchFailed = false;
      let distChanged = false;
      if (rawOpts.contentOnly !== true && rawOpts.skipPatch !== true) {
        console.log();
        const patchReport = runOpenClawPatches({ dryRun });
        patchFailed = patchReport.failed;
        distChanged = patchReport.changed && !dryRun;
      }

      let skillsFailed = false;
      if (rawOpts.contentOnly !== true) {
        console.log();
        const skills = await runSkillsCommand('install', {
          dryRun,
          ...(skillsMode ? { mode: skillsMode } : {}),
        });
        skillsFailed = skills.exitCode !== 0;
      }

      console.log();
      const bootstrap = measureBootstrapFiles(
        getWorkspacePath(),
        rawOpts.contentOnly === true
          ? DEFAULT_BOOTSTRAP_LIMITS
          : await readBootstrapLimits(deps.runner),
      );
      printLines(bootstrapReportLines(bootstrap));
      const bootstrapFailed =
        rawOpts.strict === true && hasBootstrapProblems(bootstrap);

      printLines(gatewayNotice(applied, distChanged));

      console.log(dryRun ? DRY_RUN_COMPLETE : '✅ Jeeves installed.');

      if (patchFailed || skillsFailed || bootstrapFailed) process.exitCode = 1;
    });
}
