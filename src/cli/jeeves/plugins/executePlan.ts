/**
 * Execute or print a plugin operation plan.
 *
 * @remarks
 * Dry run: prints every step (exact command lines, batch file contents with
 * secrets redacted, conditional config repairs) and performs no mutation.
 * Live: runs steps in order and stops at the first failure; a non-zero exit
 * from any `openclaw` command throws {@link CommandFailedError}, which the CLI
 * turns into a non-zero exit. Config batches are written to an owner-only
 * temp file, passed with `--batch-file`, and deleted afterwards. Config
 * writes (batches and unsets) are retried with bounded backoff only while
 * OpenClaw reports that a freshly installed plugin has not converged yet
 * (see {@link withConvergenceRetry}); before each wait the migration sweep
 * runs again (see {@link runMigrationSweep}), and the batch file is kept for
 * the retries and deleted once. Plugin installs wait for a running gateway
 * to settle first and survive a lost gateway connection when the plugin is
 * verified installed afterwards (see `pluginInstallStep.ts`).
 *
 * @module
 */

import { formatCommand } from './commandLine.js';
import { type CommandRunner, runChecked } from './commandRunner.js';
import { computePostUninstallRepair } from './configPatch.js';
import {
  type Sleep,
  timerSleep,
  withConvergenceRetry,
} from './convergenceRetry.js';
import { describeConfigBatchLines, describeStep } from './describeStep.js';
import {
  DEFAULT_GATEWAY_WAIT,
  type GatewayWaitPolicy,
  type GatewayWaitPorts,
} from './gatewayWait.js';
import type { LegacyFs } from './legacyExtensions.js';
import { runMigrationSweep } from './migrationSweep.js';
import {
  BATCH_FILE_NAME,
  configBatchPayload,
  configSetBatchFileArgs,
  type ConfigSetOperation,
  configUnsetArgs,
  OPENCLAW_BIN,
} from './openclawCommands.js';
import { readPluginsConfig } from './openclawState.js';
import type { PlanStep } from './plan.js';
import {
  detectGateway,
  type GatewayTracker,
  runPluginInstall,
} from './pluginInstallStep.js';
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
  /** Sleep port for convergence retries and gateway waits (default: real timer). */
  sleep?: Sleep;
  /** Clock port for gateway waits (default: `Date.now`). */
  clock?: () => number;
  /** Gateway wait policy (default {@link DEFAULT_GATEWAY_WAIT}). */
  gatewayWait?: GatewayWaitPolicy;
}

/** Gateway wait ports from the execution context. */
const waitPorts = (ctx: ExecutePlanContext): GatewayWaitPorts => ({
  runner: ctx.runner,
  sleep: ctx.sleep ?? timerSleep,
  clock: ctx.clock ?? Date.now,
  log: ctx.log,
  policy: ctx.gatewayWait ?? DEFAULT_GATEWAY_WAIT,
});

/** Retry an idempotent config write while plugins converge. */
const retryingConfigWrite = (
  ctx: ExecutePlanContext,
  action: () => Promise<void>,
): Promise<void> =>
  withConvergenceRetry(action, {
    sleep: ctx.sleep ?? timerSleep,
    log: ctx.log,
    beforeRetry: () => runMigrationSweep(ctx.runner, ctx.log),
  });

/** Run one command (echoing its output), logging its command line first. */
async function runLogged(
  ctx: ExecutePlanContext,
  command: string,
  args: string[],
): Promise<void> {
  ctx.log(`$ ${formatCommand(command, args)}`);
  await runChecked(ctx.runner, command, args, { echo: true });
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
  const [command, ...details] = describeConfigBatchLines(ops, redact);
  ctx.log(`$ ${command}`);
  for (const line of details) ctx.log(line);
  await withPrivateTempFile(
    ctx.tempFiles,
    BATCH_FILE_NAME,
    configBatchPayload(ops),
    (path) =>
      retryingConfigWrite(ctx, async () => {
        await runChecked(
          ctx.runner,
          OPENCLAW_BIN,
          configSetBatchFileArgs(path),
          { echo: true, ...(redact ? { redact } : {}) },
        );
      }),
    ctx.log,
  );
}

/** Execute one step for real. */
async function executeStep(
  step: PlanStep,
  ctx: ExecutePlanContext,
  gateway: GatewayTracker,
): Promise<void> {
  switch (step.kind) {
    case 'exec':
      await runLogged(ctx, step.command, step.args);
      return;
    case 'pluginInstall':
      await runPluginInstall(waitPorts(ctx), gateway, step);
      return;
    case 'configSetBatch':
      await runConfigBatch(ctx, step.ops, step.redact);
      gateway.reloadPending = true;
      return;
    case 'migrationSweep':
      await runMigrationSweep(ctx.runner, ctx.log);
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
        await retryingConfigWrite(ctx, () =>
          runLogged(ctx, OPENCLAW_BIN, configUnsetArgs(path)),
        );
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
  const gateway: GatewayTracker = steps.some((s) => s.kind === 'pluginInstall')
    ? await detectGateway(waitPorts(ctx))
    : { present: false, reloadPending: false };
  for (const step of steps) await executeStep(step, ctx, gateway);
}
