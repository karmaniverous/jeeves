/**
 * Execute or print a plugin operation plan.
 *
 * @remarks
 * Dry run: prints every step (exact command lines, batch file contents with
 * secrets redacted, conditional config repairs) and performs no mutation.
 * Live: runs steps in order and stops at the first failure; a non-zero exit
 * from any `openclaw` command throws {@link CommandFailedError}, which the CLI
 * turns into a non-zero exit. Config batches are written to an owner-only
 * temp file, passed with `--batch-file`, and deleted afterwards.
 *
 * @module
 */

import {
  type CommandRunner,
  formatCommand,
  runChecked,
} from './commandRunner.js';
import { computePostUninstallRepair } from './configPatch.js';
import type { LegacyFs } from './legacyExtensions.js';
import {
  BATCH_FILE_NAME,
  configBatchPayload,
  configSetBatchFileArgs,
  type ConfigSetOperation,
  configUnsetArgs,
  OPENCLAW_BIN,
} from './openclawCommands.js';
import { readPluginsConfig } from './openclawState.js';
import { describeConfigBatch, describeStep, type PlanStep } from './plan.js';
import {
  type PrivateTempFiles,
  withPrivateTempFile,
} from './privateTempFile.js';
import type { ServerConfigWriter } from './serverConfigWrite.js';

/** Dependencies of {@link executePlan}. */
export interface ExecutePlanContext {
  /** Command runner port. */
  runner: CommandRunner;
  /** Filesystem port for legacy removal. */
  fs: LegacyFs;
  /** Owner-only temp files for config batches. */
  tempFiles: PrivateTempFiles;
  /** Writes the server's `keys._plugin` (backup, lock, atomic write). */
  serverConfig: ServerConfigWriter;
  /** Line logger. */
  log: (line: string) => void;
  /** Print only; mutate nothing. */
  dryRun: boolean;
}

/** Run one openclaw command, logging it first. */
async function runLogged(
  ctx: ExecutePlanContext,
  args: string[],
): Promise<void> {
  ctx.log(`$ ${formatCommand(OPENCLAW_BIN, args)}`);
  await runChecked(ctx.runner, OPENCLAW_BIN, args, { echo: true });
}

/**
 * Apply config operations with `openclaw config set --batch-file`.
 *
 * @param ctx - Execution context.
 * @param ops - Operations (non-empty).
 * @param redact - Secret values to keep out of logs and errors.
 */
async function runConfigBatch(
  ctx: ExecutePlanContext,
  ops: readonly ConfigSetOperation[],
  redact?: readonly string[],
): Promise<void> {
  const shown = describeConfigBatch(ops, redact);
  ctx.log(`$ ${shown.command}`);
  ctx.log(`  batch file content: ${shown.content}`);
  await withPrivateTempFile(
    ctx.tempFiles,
    BATCH_FILE_NAME,
    configBatchPayload(ops),
    async (path) => {
      await runChecked(ctx.runner, OPENCLAW_BIN, configSetBatchFileArgs(path), {
        echo: true,
        ...(redact ? { redact } : {}),
      });
    },
    ctx.log,
  );
}

/** Execute one step for real. */
async function executeStep(
  step: PlanStep,
  ctx: ExecutePlanContext,
): Promise<void> {
  switch (step.kind) {
    case 'exec':
      ctx.log(`$ ${describeStep(step)[0]}`);
      await runChecked(ctx.runner, step.command, step.args, { echo: true });
      return;
    case 'configSetBatch':
      await runConfigBatch(ctx, step.ops, step.redact);
      return;
    case 'removeDir':
      if (ctx.fs.isDirectory(step.path)) {
        ctx.fs.removeDir(step.path);
        ctx.log(`removed legacy plugin copy: ${step.path}`);
      } else {
        ctx.log(`legacy plugin copy already gone: ${step.path}`);
      }
      return;
    case 'serverKeyWrite': {
      const backup = await ctx.serverConfig(step.write);
      ctx.log(
        `set keys._plugin in ${step.write.path} (value not shown; backup: ${backup})`,
      );
      return;
    }
    case 'repairAfterUninstall': {
      const after = await readPluginsConfig(ctx.runner);
      const repair = computePostUninstallRepair(
        step.before,
        after,
        step.pluginIds,
      );
      for (const path of repair.unsetPaths) {
        await runLogged(ctx, configUnsetArgs(path));
      }
      if (repair.setOps.length > 0) await runConfigBatch(ctx, repair.setOps);
      return;
    }
  }
}

/**
 * Print (dry run) or execute a plan.
 *
 * @param steps - Plan steps.
 * @param ctx - Execution context.
 */
export async function executePlan(
  steps: readonly PlanStep[],
  ctx: ExecutePlanContext,
): Promise<void> {
  if (ctx.dryRun) {
    for (const step of steps) {
      for (const line of describeStep(step)) ctx.log(`[dry-run] ${line}`);
    }
    return;
  }
  for (const step of steps) await executeStep(step, ctx);
}
