/**
 * CLI status command: discover components and probe their health.
 *
 * @remarks
 * Probes each platform component (runner, watcher, server, meta) via
 * GET /status at its resolved URL. Exits with code 0 if all services are
 * healthy, code 1 if any are unreachable.
 *
 * @module
 */

import type { Command } from '@commander-js/extra-typings';

import { PLATFORM_COMPONENTS } from '../../constants/index.js';
import { getWorkspacePath } from '../../init.js';
import { analyzeMemory } from '../../memory/index.js';
import { initFromOptions } from './cliDefaults.js';
import { probeStatus, readStatusVersion } from './serviceProbe.js';

/** Column widths of the component table. */
const COLUMN_WIDTHS = [10, 30, 12] as const;

/**
 * One component table row.
 *
 * @param cells - Component, status, version.
 * @returns The padded row.
 */
const tableRow = (cells: readonly string[]): string =>
  cells.map((cell, i) => cell.padEnd(COLUMN_WIDTHS[i] ?? 0)).join('  ');

/** Probe result of one component, for the table. */
interface ComponentStatus {
  status: string;
  version: string;
  healthy: boolean;
}

/**
 * Probe one component and describe it.
 *
 * @param name - Component name.
 * @param timeoutMs - Probe timeout.
 * @returns Status text, version (or `—`) and health.
 */
async function componentStatus(
  name: string,
  timeoutMs: number,
): Promise<ComponentStatus> {
  const response = await probeStatus(name, timeoutMs);
  if (!response) return { status: '❌ Down', version: '—', healthy: false };
  if (!response.ok) {
    return {
      status: `❌ HTTP ${String(response.status)}`,
      version: '—',
      healthy: false,
    };
  }
  return {
    status: '✅ Running',
    version: (await readStatusVersion(response)) ?? '—',
    healthy: true,
  };
}

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

      console.log(tableRow(['Component', 'Status', 'Version']));
      console.log(tableRow(COLUMN_WIDTHS.map((w) => '-'.repeat(w))));

      for (const name of PLATFORM_COMPONENTS) {
        const { status, version, healthy } = await componentStatus(
          name,
          timeoutMs,
        );
        if (!healthy) allHealthy = false;
        console.log(tableRow([name, status, version]));
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
