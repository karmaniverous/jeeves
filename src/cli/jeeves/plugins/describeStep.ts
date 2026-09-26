/**
 * Human-readable lines for plan steps: the exact command lines, batch file
 * contents with secrets redacted, and conditional repairs. Pure; used for
 * dry-run output and for the live log.
 *
 * @module
 */

import { formatCommand } from './commandLine.js';
import { entryPath, restoreLoadOp } from './configPatch.js';
import { MIGRATION_SWEEP_LINE } from './migrationSweep.js';
import {
  BATCH_FILE_PLACEHOLDER,
  CONFIG_SET_BATCH_FILE,
  configBatchPayload,
  type ConfigSetOperation,
  configUnsetArgs,
  OPENCLAW_BIN,
} from './openclawCommands.js';
import type { PlanStep } from './plan.js';
import { REDACTED, redactSecrets } from './secrets.js';

/**
 * Display form of a batch write: the command line (temp file placeholder)
 * and the file content, secrets redacted.
 *
 * @param ops - Operations.
 * @param redact - Secret values.
 * @returns Command line and content description.
 */
function describeConfigBatch(
  ops: readonly ConfigSetOperation[],
  redact?: readonly string[],
): { command: string; content: string } {
  return {
    command: `${formatCommand(OPENCLAW_BIN, CONFIG_SET_BATCH_FILE)} ${BATCH_FILE_PLACEHOLDER}`,
    content: redactSecrets(configBatchPayload(ops), redact),
  };
}

/**
 * Lines for a batch write: the command line, then the file content.
 *
 * @param ops - Operations (non-empty).
 * @param redact - Secret values.
 * @returns `[command, "  batch file content: …"]`.
 */
export function describeConfigBatchLines(
  ops: readonly ConfigSetOperation[],
  redact?: readonly string[],
): string[] {
  const { command, content } = describeConfigBatch(ops, redact);
  return [command, `  batch file content: ${content}`];
}

/**
 * Human-readable lines for one step (used for dry-run and live logs).
 *
 * @param step - Plan step.
 * @returns One or more lines; exec steps are exact command lines.
 */
export function describeStep(step: PlanStep): string[] {
  switch (step.kind) {
    case 'exec':
      return [formatCommand(step.command, step.args)];
    case 'configSetBatch':
      return describeConfigBatchLines(step.ops, step.redact);
    case 'migrationSweep':
      return [MIGRATION_SWEEP_LINE];
    case 'removeDir':
      return [`remove legacy plugin copy: ${step.path}`];
    case 'serverKeyWrite':
      return [
        `set keys._plugin = ${REDACTED} in ${step.write.path} (${step.write.expect.kind === 'absent' ? 'currently unset' : 'replacing the current seed'}; backup ${step.write.path}.bak-<timestamp> first, then atomic write; restart jeeves-server afterwards)`,
      ];
    case 'repairAfterUninstall': {
      const lines = step.pluginIds.map(
        (id) =>
          `if left as {"enabled":false}: ${formatCommand(OPENCLAW_BIN, configUnsetArgs(entryPath(id)))}`,
      );
      if (step.before.load !== undefined) {
        const { command, content } = describeConfigBatch([
          restoreLoadOp(step.before.load),
        ]);
        lines.push(`if plugins.load was removed: ${command} with ${content}`);
      }
      return lines;
    }
  }
}
