/**
 * CLI status command: discover components and probe their health.
 *
 * @remarks
 * Probes each platform component (runner, watcher, server, meta) via
 * GET /status at its resolved URL. Exits with code 0 if all services are
 * healthy, code 1 if any are unreachable.
 */

import type { Command } from '@commander-js/extra-typings';

import { PLATFORM_COMPONENTS } from '../../constants/index.js';
import { getServiceUrl } from '../../discovery/getServiceUrl.js';
import { getWorkspacePath } from '../../init.js';
import { analyzeMemory } from '../../memory/index.js';
import { fetchWithTimeout } from '../../plugin/http.js';
import { initFromOptions } from './cliDefaults.js';

/**
 * Register the status subcommand on the parent CLI program.
 *
 * @param program - The parent Commander program.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Discover Jeeves components and probe their health')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .option('-t, --timeout <ms>', 'Probe timeout in milliseconds', '3000')
    .action(async (opts) => {
      const timeoutMs = parseInt(opts.timeout, 10);

      const resolved = initFromOptions(opts);

      console.log('Jeeves Platform Status');
      console.log('='.repeat(60));
      console.log();

      let allHealthy = true;

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

      for (const name of PLATFORM_COMPONENTS) {
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

      const memory = analyzeMemory({
        workspacePath: getWorkspacePath(),
        budget: resolved.memory.budget.value,
        warningThreshold: resolved.memory.warningThreshold.value,
      });

      console.log('Memory hygiene');
      console.log('-'.repeat(60));
      if (!memory.exists) {
        console.log('MEMORY.md not found.');
      } else {
        const usagePct = Math.round(memory.usage * 100);
        const status = memory.overBudget
          ? '❌ Over budget'
          : memory.warning
            ? '⚠ Warning'
            : '✅ OK';
        console.log(
          `Chars: ${String(memory.charCount)} / ${String(memory.budget)} (${String(usagePct)}%) — ${status}`,
        );
      }

      console.log();

      if (!allHealthy) {
        process.exitCode = 1;
      }
    });
}
