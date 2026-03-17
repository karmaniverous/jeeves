/**
 * CLI install command: seed platform content into the workspace.
 *
 * @remarks
 * Seeds SOUL.md, AGENTS.md, TOOLS.md Platform section using the same
 * `updateManagedSection()` code path as writer cycles. Copies templates
 * to config dir. Creates core config with defaults if missing.
 * Jaccard cleanup detection runs on install (Decision 22).
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { seedContent } from '../../platform/seedContent.js';
import {
  DEFAULT_CONFIG_ROOT,
  DEFAULT_WORKSPACE,
  initFromOptions,
} from './cliDefaults.js';

/**
 * Register the install subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Seed Jeeves platform content into the workspace')
    .option('-w, --workspace <path>', 'Workspace root path', DEFAULT_WORKSPACE)
    .option(
      '-c, --config-root <path>',
      'Platform config root path',
      DEFAULT_CONFIG_ROOT,
    )
    .action(async (opts) => {
      console.log('Jeeves platform install');
      console.log(`  Workspace: ${opts.workspace}`);
      console.log(`  Config root: ${opts.configRoot}`);
      console.log();

      initFromOptions(opts);

      await seedContent({
        coreVersion: CORE_VERSION,
        skipRegistryCheck: true,
      });

      console.log('✅ Platform content seeded successfully.');
      console.log('  - SOUL.md managed section written');
      console.log('  - AGENTS.md managed section written');
      console.log('  - TOOLS.md Platform section written');
      console.log('  - Templates copied to config directory');
      console.log('  - Core config created (if not present)');
    });
}
