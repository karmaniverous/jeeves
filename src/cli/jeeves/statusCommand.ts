/**
 * CLI status command: probe all service ports and report health summary.
 *
 * @remarks
 * Displays a table of all Jeeves platform services with port and
 * health status. Exits with code 0 if all services are healthy,
 * code 1 if any are unreachable.
 */

import type { Command } from '@commander-js/extra-typings';

import { probeAllServices } from '../../discovery/probe.js';
import {
  DEFAULT_CONFIG_ROOT,
  DEFAULT_WORKSPACE,
  initFromOptions,
} from './cliDefaults.js';

/**
 * Register the status subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Probe all Jeeves service ports and report health summary')
    .option('-w, --workspace <path>', 'Workspace root path', DEFAULT_WORKSPACE)
    .option(
      '-c, --config-root <path>',
      'Platform config root path',
      DEFAULT_CONFIG_ROOT,
    )
    .option('-t, --timeout <ms>', 'Probe timeout in milliseconds', '3000')
    .action(async (opts) => {
      const timeoutMs = parseInt(opts.timeout, 10);

      initFromOptions(opts);

      console.log('Jeeves Platform Status');
      console.log('='.repeat(60));
      console.log();

      const probeResults = await probeAllServices(undefined, timeoutMs);

      const nameWidth = 10;
      const portWidth = 6;
      const statusWidth = 30;
      const header = [
        'Service'.padEnd(nameWidth),
        'Port'.padEnd(portWidth),
        'Status'.padEnd(statusWidth),
      ].join('  ');
      const separator = [
        '-'.repeat(nameWidth),
        '-'.repeat(portWidth),
        '-'.repeat(statusWidth),
      ].join('  ');

      console.log(header);
      console.log(separator);

      let allHealthy = true;
      for (const r of probeResults) {
        let status: string;
        if (r.healthy) {
          status = r.version ? `✅ Running (v${r.version})` : '✅ Running';
        } else {
          status = r.error ? `❌ ${r.error}` : '❌ Down';
          allHealthy = false;
        }

        const row = [
          r.name.padEnd(nameWidth),
          String(r.port).padEnd(portWidth),
          status.padEnd(statusWidth),
        ].join('  ');
        console.log(row);
      }

      console.log();

      const healthy = probeResults.filter((r) => r.healthy).length;
      const total = probeResults.length;
      console.log(`${String(healthy)}/${String(total)} services healthy`);

      if (!allHealthy) {
        process.exitCode = 1;
      }
    });
}
