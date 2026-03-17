#!/usr/bin/env node

/**
 * Jeeves CLI — platform content seeding, teardown, and status.
 *
 * @remarks
 * Entry point for the `jeeves` CLI command. Provides install, uninstall,
 * and status subcommands.
 */

import { Command } from '@commander-js/extra-typings';

import { registerInstallCommand } from './installCommand.js';
import { registerStatusCommand } from './statusCommand.js';
import { registerUninstallCommand } from './uninstallCommand.js';

const cli = new Command()
  .name('jeeves')
  .description('Jeeves AI assistant platform — shared library and CLI')
  .version('0.0.0')
  .enablePositionalOptions()
  .passThroughOptions();

registerInstallCommand(cli);
registerUninstallCommand(cli);
registerStatusCommand(cli);

cli.parse();
