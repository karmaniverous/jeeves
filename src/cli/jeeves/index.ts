#!/usr/bin/env node

import { Command } from '@commander-js/extra-typings';

const cli = new Command()
  .name('jeeves')
  .description('Jeeves AI assistant platform — shared library and CLI')
  .version('0.0.0')
  .enablePositionalOptions()
  .passThroughOptions();

cli.parse();
