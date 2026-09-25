/**
 * CLI install command: render the static platform content into a workspace once.
 *
 * @remarks
 * Writes the SOUL.md/AGENTS.md managed blocks (preserving user content),
 * the platform skills, the reference templates, and the core config (if
 * missing). No TOOLS.md, no HEARTBEAT.md, nothing recurring. Re-running
 * replaces the managed blocks in place.
 */

import type { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getCoreConfigDir, getWorkspacePath } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';
import { installPlatformContent } from './installPlatformContent.js';

/**
 * Register the install subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Render Jeeves static platform content into the workspace')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action((opts) => {
      const resolved = initFromOptions(opts);

      console.log('Jeeves platform install');
      console.log(`  Workspace: ${resolved.core.workspace.value}`);
      console.log(`  Config root: ${resolved.core.configRoot.value}`);
      console.log();

      const written = installPlatformContent({
        workspacePath: getWorkspacePath(),
        coreConfigDir: getCoreConfigDir(),
        version: CORE_VERSION,
      });

      for (const file of written) console.log(`  ✓ ${file}`);
      console.log();
      console.log('✅ Platform content rendered.');
    });
}
