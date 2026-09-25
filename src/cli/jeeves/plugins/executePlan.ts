/**
 * Execute or print a plugin operation plan.
 *
 * @remarks
 * Dry run: prints every step (exact command lines and conditional config
 * repairs) and performs no mutation. Live: runs steps in order and stops at
 * the first failure; a non-zero exit from any `openclaw` command throws
 * {@link CommandFailedError}, which the CLI turns into a non-zero exit.
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
  configSetBatchArgs,
  configUnsetArgs,
  OPENCLAW_BIN,
} from './openclawCommands.js';
import { readPluginsConfig } from './openclawState.js';
import { describeStep, type PlanStep } from './plan.js';

/** Dependencies of {@link executePlan}. */
export interface ExecutePlanContext {
  /** Command runner port. */
  runner: CommandRunner;
  /** Filesystem port for legacy removal. */
  fs: LegacyFs;
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

/** Execute one step for real. */
async function executeStep(
  step: PlanStep,
  ctx: ExecutePlanContext,
): Promise<void> {
  switch (step.kind) {
    case 'exec':
      ctx.log(`$ ${formatCommand(step.command, step.args)}`);
      await runChecked(ctx.runner, step.command, step.args, { echo: true });
      return;
    case 'removeDir':
      if (ctx.fs.isDirectory(step.path)) {
        ctx.fs.removeDir(step.path);
        ctx.log(`removed legacy plugin copy: ${step.path}`);
      } else {
        ctx.log(`legacy plugin copy already gone: ${step.path}`);
      }
      return;
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
      if (repair.setOps.length > 0) {
        await runLogged(ctx, configSetBatchArgs(repair.setOps));
      }
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
