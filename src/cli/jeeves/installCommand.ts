/**
 * CLI install command: render the static platform content, install or
 * update the Jeeves component plugins through the OpenClaw CLI, and write
 * their `plugins.entries.<id>.config`.
 *
 * @remarks
 * Content: SOUL.md/AGENTS.md managed blocks (user content preserved),
 * core config if missing. Never TOOLS.md, HEARTBEAT.md, anything under
 * `skills/` or the spec templates (jeeves-tools ships those). Plugins: one standard
 * `openclaw plugins install npm:<pkg>\@<ver> --pin --accept-capabilities --force`
 * per plugin that is not already installed at that exact version (unless
 * `--force-reinstall`), then legacy cleanup and one
 * `config set --batch-file` with hook access (plugins that declare
 * conversation hooks) and plugin config (see `plugins/workflows.ts`). Plugin
 * config precedence: option \> `--plugin-config` \> existing \> default \>
 * error; required values are checked before anything is written.
 * `--dry-run` prints everything (secrets redacted) and changes nothing. Never
 * restarts the gateway. Idempotent: re-running replaces managed blocks in
 * place and skips plugins that are already current.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import {
  DRY_RUN_COMPLETE,
  installNotices,
  printLines,
  RESTART_NOTICE,
  runHeaderLines,
} from './cliOutput.js';
import { installPlatformContent } from './installPlatformContent.js';
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
      '--dry-run',
      'Print planned file writes, plugin config and exact openclaw commands; change nothing',
    )
    .action(async (plugins, rawOpts) => {
      const dryRun = rawOpts.dryRun === true;
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

      if (targets.length > 0) {
        await executePlan(prepared.plan, deps);
        console.log();
        printLines(installNotices(prepared, dryRun));
        if (!dryRun && prepared.plan.length > 0) console.log(RESTART_NOTICE);
      }

      console.log(dryRun ? DRY_RUN_COMPLETE : '✅ Jeeves installed.');
    });
}
