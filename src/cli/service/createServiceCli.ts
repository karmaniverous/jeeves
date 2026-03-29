/**
 * Factory for the standard Jeeves service CLI.
 *
 * @remarks
 * Produces a Commander program with all standard commands from
 * a component descriptor. Components add domain-specific commands
 * via `descriptor.customCliCommands`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from '@commander-js/extra-typings';

import type { JeevesComponentDescriptor } from '../../component/descriptor.js';
import { getEffectiveServiceName } from '../../component/descriptor.js';
import { getComponentConfigDir } from '../../init.js';
import { fetchJson, postJson } from '../../plugin/http.js';
import {
  createServiceManager,
  type ServiceManager,
} from '../../service/createServiceManager.js';

/**
 * Create a standard service CLI program from a component descriptor.
 *
 * @remarks
 * Standard commands:
 * - `start -c <path>` - Launch the service process (foreground)
 * - `status [-p port]` - Probe service health
 * - `config [jsonpath] [-p port]` - Query running config
 * - `config validate -c <path>` - Validate a config file
 * - `config apply [-p port] [--file path] [--replace]` - Apply config patch
 * - `init [-o path]` - Generate default config
 * - `service install` - Install system service
 * - `service uninstall` - Uninstall system service
 * - `service start` - Start system service
 * - `service stop` - Stop system service
 * - `service restart` - Restart system service
 * - `service status` - Query system service state
 *
 * @param descriptor - The component descriptor.
 * @returns A Commander program ready for custom commands and `.parse()`.
 */
export function createServiceCli(
  descriptor: JeevesComponentDescriptor,
): Command {
  const defaultServiceName = getEffectiveServiceName(descriptor);

  const program = new Command()
    .name(`jeeves-${descriptor.name}`)
    .description(`Jeeves ${descriptor.name} service CLI`)
    .version(descriptor.version)
    .enablePositionalOptions()
    .passThroughOptions();

  // --- start ---
  program
    .command('start')
    .description('Launch the service process (foreground)')
    .requiredOption('-c, --config <path>', 'Config file path')
    .action((opts) => {
      const cmdArgs = descriptor.startCommand(opts.config);
      const proc = spawn(cmdArgs[0], cmdArgs.slice(1), {
        stdio: 'inherit',
      });
      proc.on('exit', (code: number | null) => {
        process.exit(code ?? 1);
      });
    });

  // --- status ---
  program
    .command('status')
    .description('Probe service health and version')
    .option('-p, --port <port>', 'Service port', String(descriptor.defaultPort))
    .action(async (opts) => {
      const url = `http://127.0.0.1:${opts.port}`;
      try {
        const result = await fetchJson(`${url}/status`);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Service unreachable: ${msg}`);
        process.exitCode = 1;
      }
    });

  // --- config ---
  const configCmd = program
    .command('config')
    .description('Query or manage service configuration');

  configCmd
    .command('query')
    .description('Query running service config via JSONPath')
    .argument('[jsonpath]', 'JSONPath expression')
    .option('-p, --port <port>', 'Service port', String(descriptor.defaultPort))
    .action(async (jsonpath, opts) => {
      const url = `http://127.0.0.1:${opts.port}`;
      const qs = jsonpath ? `?path=${encodeURIComponent(jsonpath)}` : '';
      try {
        const result = await fetchJson(`${url}/config${qs}`);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Config query failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  configCmd
    .command('validate')
    .description('Validate a config file against the schema')
    .requiredOption('-c, --config <path>', 'Config file path')
    .action((opts) => {
      try {
        const raw = readFileSync(opts.config, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        descriptor.configSchema.parse(parsed);
        console.log('Config is valid.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Validation failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  configCmd
    .command('apply')
    .description('Apply a config patch to the running service')
    .option('-p, --port <port>', 'Service port', String(descriptor.defaultPort))
    .option('-f, --file <path>', 'Config patch file (JSON)')
    .option('--replace', 'Replace entire config instead of merging')
    .action(async (opts) => {
      const url = `http://127.0.0.1:${opts.port}`;
      let patch: Record<string, unknown> = {};

      if (opts.file) {
        const raw = readFileSync(opts.file, 'utf-8');
        patch = JSON.parse(raw) as Record<string, unknown>;
      } else {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        const input = Buffer.concat(chunks).toString('utf-8').trim();
        if (input) {
          patch = JSON.parse(input) as Record<string, unknown>;
        }
      }

      const qs = opts.replace ? '?replace=true' : '';
      try {
        const result = await postJson(`${url}/config/apply${qs}`, patch);
        console.log(JSON.stringify(result, null, 2));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Config apply failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // --- init ---
  program
    .command('init')
    .description('Generate default config file')
    .option('-o, --output <path>', 'Output directory')
    .action((opts) => {
      const outputDir = opts.output ?? getComponentConfigDir(descriptor.name);
      mkdirSync(outputDir, { recursive: true });

      const configPath = join(outputDir, descriptor.configFileName);
      if (existsSync(configPath)) {
        console.log(`Config already exists at ${configPath}`);
        return;
      }

      const template = descriptor.initTemplate();
      writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n');
      console.log(`Config written to ${configPath}`);
    });

  // --- service ---
  const serviceCmd = program
    .command('service')
    .description('System service management');

  const svcManager: ServiceManager = createServiceManager(descriptor);

  serviceCmd
    .command('install')
    .description('Install as a system service')
    .option('-c, --config <path>', 'Config file path')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        svcManager.install({ name: opts.name, configPath: opts.config });
        console.log(`Service "${opts.name}" installed.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Install failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command('uninstall')
    .description('Uninstall the system service')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        svcManager.uninstall({ name: opts.name });
        console.log(`Service "${opts.name}" uninstalled.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Uninstall failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command('start')
    .description('Start the system service')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        svcManager.start({ name: opts.name });
        console.log(`Service "${opts.name}" started.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Start failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command('stop')
    .description('Stop the system service')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        svcManager.stop({ name: opts.name });
        console.log(`Service "${opts.name}" stopped.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Stop failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command('restart')
    .description('Restart the system service')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        svcManager.restart({ name: opts.name });
        console.log(`Service "${opts.name}" restarted.`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Restart failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  serviceCmd
    .command('status')
    .description('Query system service state')
    .option('-n, --name <name>', 'Service name', defaultServiceName)
    .action((opts) => {
      try {
        const state = svcManager.status({ name: opts.name });
        console.log(`Service "${opts.name}": ${state}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Status failed: ${msg}`);
        process.exitCode = 1;
      }
    });

  // Apply custom CLI commands if provided
  if (descriptor.customCliCommands) {
    descriptor.customCliCommands(program as unknown as Command);
  }

  return program;
}
