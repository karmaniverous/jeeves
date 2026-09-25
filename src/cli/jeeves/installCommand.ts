/**
 * CLI install command: render the static platform content and install or
 * update the Jeeves component plugins through the OpenClaw CLI.
 *
 * @remarks
 * Content: SOUL.md/AGENTS.md managed blocks (user content preserved),
 * platform skills, reference templates, core config if missing. Never
 * TOOLS.md or HEARTBEAT.md. Plugins: one standard
 * `openclaw plugins install npm:<pkg>\@<ver> --pin --accept-capabilities --force`
 * per plugin, then hook access and legacy cleanup (see `plugins/workflows.ts`). `--dry-run` prints everything and changes
 * nothing. Idempotent: re-running replaces managed blocks in place.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import { installPlatformContent } from './installPlatformContent.js';
import {
  createPluginWorkflowDeps,
  RESTART_NOTICE,
} from './plugins/pluginDeps.js';
import {
  defaultPluginTargets,
  parsePluginSpecs,
} from './plugins/pluginSpec.js';
import { installPlugins } from './plugins/workflows.js';

/**
 * Register the install subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description(
      'Render Jeeves platform content and install/update the component plugins',
    )
    .argument(
      '[plugins...]',
      'Plugin specs, e.g. watcher, watcher@1.2.3 (default: runner, watcher, server, meta at latest)',
    )
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .option('--content-only', 'Render platform content only; skip plugins')
    .option(
      '--dry-run',
      'Print planned file writes and exact openclaw commands; change nothing',
    )
    .action(async (plugins, opts) => {
      const dryRun = opts.dryRun === true;
      // Validate specs before writing anything.
      const targets = opts.contentOnly
        ? []
        : plugins.length > 0
          ? parsePluginSpecs(plugins)
          : defaultPluginTargets();
      const resolved = initFromOptions(opts);

      console.log(
        `Jeeves platform install${dryRun ? ' [dry run: no changes]' : ''}`,
      );
      console.log(`  Workspace: ${resolved.core.workspace.value}`);
      console.log(`  Config root: ${resolved.core.configRoot.value}`);
      console.log();

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
        await installPlugins(createPluginWorkflowDeps(dryRun), targets);
        console.log();
        if (!dryRun) console.log(RESTART_NOTICE);
      }

      console.log(
        dryRun
          ? 'Dry run complete. Nothing was changed.'
          : '✅ Jeeves installed.',
      );
    });
}
