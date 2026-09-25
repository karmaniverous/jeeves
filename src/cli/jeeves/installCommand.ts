/**
 * CLI install command: render the static platform content, install or
 * update the Jeeves component plugins through the OpenClaw CLI, and write
 * their `plugins.entries.<id>.config`.
 *
 * @remarks
 * Content: SOUL.md/AGENTS.md managed blocks (user content preserved),
 * platform skills, reference templates, core config if missing. Never
 * TOOLS.md or HEARTBEAT.md. Plugins: one standard
 * `openclaw plugins install npm:<pkg>\@<ver> --pin --accept-capabilities --force`
 * per plugin, then legacy cleanup and one `config set --batch-json` with hook
 * access and plugin config (see `plugins/workflows.ts`). Plugin config
 * precedence: option \> `--plugin-config` \> existing \> default \> error;
 * required values are checked before anything is written. `--dry-run` prints
 * everything (secrets redacted) and changes nothing. Never restarts the
 * gateway. Idempotent: re-running replaces managed blocks in place.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import { installPlatformContent } from './installPlatformContent.js';
import { executePlan } from './plugins/executePlan.js';
import {
  loadPluginConfigFile,
  normalizeConfigRoot,
  pluginConfigFromOptions,
} from './plugins/pluginConfigInput.js';
import { generatedSecretNotices } from './plugins/pluginConfigReport.js';
import {
  createPluginConfigRequest,
  createPluginWorkflowDeps,
  RESTART_NOTICE,
} from './plugins/pluginDeps.js';
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
  program
    .command('install')
    .description(
      'Render Jeeves platform content, install/update the component plugins, and write their config',
    )
    .argument(
      '[plugins...]',
      'Plugin specs, e.g. watcher, watcher@1.2.3 (default: runner, watcher, server, meta at latest)',
    )
    .option('-w, --workspace <path>', 'Workspace root path')
    .option(
      '-c, --config-root <path>',
      'Platform config root path; also written as configRoot of every Jeeves plugin',
    )
    .option('--runner-api-url <url>', 'jeeves-runner plugin apiUrl')
    .option('--watcher-api-url <url>', 'jeeves-watcher plugin apiUrl')
    .option('--server-api-url <url>', 'jeeves-server plugin apiUrl')
    .option(
      '--server-plugin-key <seed>',
      "jeeves-server plugin pluginKey (default: the server's keys._plugin, else generated)",
    )
    .option('--meta-api-url <url>', 'jeeves-meta plugin apiUrl')
    .option(
      '--plugin-config <file>',
      'JSON file with plugin config: { configRoot, runner: { apiUrl }, watcher, server: { apiUrl, pluginKey }, meta }',
    )
    .option('--content-only', 'Render platform content only; skip plugins')
    .option(
      '--dry-run',
      'Print planned file writes, plugin config and exact openclaw commands; change nothing',
    )
    .action(async (plugins, opts) => {
      const dryRun = opts.dryRun === true;
      // Validate specs and config input before writing anything.
      const targets = opts.contentOnly
        ? []
        : plugins.length > 0
          ? parsePluginSpecs(plugins)
          : defaultPluginTargets();
      const file = opts.pluginConfig
        ? loadPluginConfigFile(opts.pluginConfig)
        : {};
      const resolved = initFromOptions(opts);
      const root = resolved.core.configRoot;
      const request = createPluginConfigRequest(
        pluginConfigFromOptions(
          opts,
          root.provenance === 'flag' ? root.value : undefined,
        ),
        file,
        (root.provenance === 'env' || root.provenance === 'file') &&
          root.value.trim() !== ''
          ? normalizeConfigRoot(root.value)
          : undefined,
      );

      console.log(
        `Jeeves platform install${dryRun ? ' [dry run: no changes]' : ''}`,
      );
      console.log(`  Workspace: ${resolved.core.workspace.value}`);
      console.log(`  Config root: ${root.value}`);
      console.log();

      // Read-only: resolves versions and plugin config, fails on missing
      // required config before any content or plugin is written.
      const deps = createPluginWorkflowDeps(dryRun);
      const prepared = await prepareInstall(deps, targets, request);
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
        const notices = prepared.config
          ? generatedSecretNotices(prepared.config)
          : [];
        for (const notice of notices) console.log(notice);
        if (!dryRun) console.log(RESTART_NOTICE);
      }

      console.log(
        dryRun
          ? 'Dry run complete. Nothing was changed.'
          : '✅ Jeeves installed.',
      );
    });
}
