/**
 * CLI status command: discover components and probe their health.
 *
 * @remarks
 * Uses `readComponentVersions()` to discover registered components,
 * then probes each one via GET /status. Exits with code 0 if all
 * services are healthy, code 1 if any are unreachable.
 */

import type { Command } from '@commander-js/extra-typings';

import { readComponentVersions } from '../../component/componentVersions.js';
import { getServiceUrl } from '../../discovery/getServiceUrl.js';
import { fetchWithTimeout } from '../../plugin/http.js';
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
    .description('Discover Jeeves components and probe their health')
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

      const { getCoreConfigDir } = await import('../../init.js');
      const coreConfigDir = getCoreConfigDir();
      const componentVersions = readComponentVersions(coreConfigDir);
      const componentNames = Object.keys(componentVersions);

      if (componentNames.length === 0) {
        console.log('No components registered.');
        return;
      }

      const nameWidth = 10;
      const statusWidth = 30;
      const versionWidth = 12;
      const header = [
        'Component'.padEnd(nameWidth),
        'Status'.padEnd(statusWidth),
        'Version'.padEnd(versionWidth),
      ].join('  ');
      const separator = [
        '-'.repeat(nameWidth),
        '-'.repeat(statusWidth),
        '-'.repeat(versionWidth),
      ].join('  ');

      console.log(header);
      console.log(separator);

      let allHealthy = true;

      for (const name of componentNames) {
        let status: string;
        let version = '—';

        try {
          const url = getServiceUrl(name);
          const response = await fetchWithTimeout(`${url}/status`, timeoutMs);

          if (response.ok) {
            status = '✅ Running';
            try {
              const body: unknown = await response.json();
              if (
                typeof body === 'object' &&
                body !== null &&
                'version' in body &&
                typeof (body as Record<string, unknown>)['version'] === 'string'
              ) {
                version = (body as Record<string, unknown>)[
                  'version'
                ] as string;
              }
            } catch {
              // Non-JSON response — version stays unknown
            }
          } else {
            status = `❌ HTTP ${String(response.status)}`;
            allHealthy = false;
          }
        } catch {
          status = '❌ Down';
          allHealthy = false;
        }

        const row = [
          name.padEnd(nameWidth),
          status.padEnd(statusWidth),
          version.padEnd(versionWidth),
        ].join('  ');
        console.log(row);
      }

      console.log();

      if (!allHealthy) {
        process.exitCode = 1;
      }
    });
}
