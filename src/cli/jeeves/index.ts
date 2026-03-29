/**
 * Jeeves CLI — platform content seeding, teardown, status, and
 * dynamic subcommand discovery for installed component CLIs.
 *
 * @remarks
 * Entry point for the `jeeves` CLI command. Provides install, uninstall,
 * and status subcommands, plus dynamic proxy commands for any installed
 * `@karmaniverous/jeeves-*` component packages.
 */

import { Command } from '@commander-js/extra-typings';

import { CORE_VERSION } from '../../constants/index.js';
import {
  discoverComponentPackages,
  registerComponentProxies,
} from './discoverComponents.js';
import { registerInstallCommand } from './installCommand.js';
import { registerStatusCommand } from './statusCommand.js';
import { registerUninstallCommand } from './uninstallCommand.js';

const cli = new Command()
  .name('jeeves')
  .description('Jeeves AI assistant platform — shared library and CLI')
  .version(CORE_VERSION)
  .enablePositionalOptions()
  .passThroughOptions();

registerInstallCommand(cli);
registerUninstallCommand(cli);
registerStatusCommand(cli);

// Dynamic discovery: register proxy subcommands for installed components
const discoveredComponents = discoverComponentPackages();
registerComponentProxies(cli, discoveredComponents);

cli.parse();
