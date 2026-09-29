/**
 * Jeeves CLI — the local control surface: install (content + plugins),
 * update, uninstall, status, config, and component CLI proxies.
 *
 * @remarks
 * Entry point for the `jeeves` CLI command. `install`/`update`/`uninstall`
 * drive the OpenClaw CLI as child processes; any failure exits non-zero.
 * Dynamic proxy commands are added for installed `@karmaniverous/jeeves-*`
 * component packages.
 *
 * @module
 */

import { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import { getErrorMessage } from '../../utils.js';
import { checkNodeVersion } from './checkNodeVersion.js';

checkNodeVersion();
import { registerConfigCommand } from './configCommand.js';
import {
  discoverComponentPackages,
  registerComponentProxies,
} from './discoverComponents.js';
import { registerInstallCommand } from './installCommand.js';
import { registerStatusCommand } from './statusCommand.js';
import { registerUninstallCommand } from './uninstallCommand.js';
import { registerUpdateCommand } from './updateCommand.js';

const cli = new Command()
  .name('jeeves')
  .description('Jeeves AI assistant platform — shared library and CLI')
  .version(CORE_VERSION)
  .enablePositionalOptions()
  .passThroughOptions();

registerInstallCommand(cli);
registerUpdateCommand(cli);
registerUninstallCommand(cli);
registerStatusCommand(cli);
registerConfigCommand(cli);

// Dynamic discovery: register proxy subcommands for installed components
const discoveredComponents = discoverComponentPackages();
registerComponentProxies(cli, discoveredComponents);

try {
  await cli.parseAsync();
} catch (error) {
  console.error(`\n✖ ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
