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
 * verified installed afterwards (see `pluginInstallStep.ts`). Echoed
 * OpenClaw output hides the expected transient warnings about plugins the
 * run has configured but not installed yet (see `transientNoise.ts`), and
 * the run reports whether OpenClaw applied every change live (see
 * `applyReport.ts`).
 *
 * @module
 */

import {
  type ApplyReport,
  emptyApplyReport,
  recordChange,
} from './applyReport.js';
import { formatCommand } from './commandLine.js';
import {
  type CommandResult,
  type CommandRunner,
  runChecked,
} from './commandRunner.js';
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
import { createTransientNoise, type TransientNoise } from './transientNoise.js';

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

/** State of one live plan run. */
interface PlanRun {
  /** Gateway tracker. */
  gateway: GatewayTracker;
  /** Transient warning filter. */
  noise: TransientNoise;
  /** Live-apply tally. */
  report: ApplyReport;
}

/** Combined output of a result, for live-apply detection. */
const outputOf = (result: CommandResult): string =>
  `${result.stdout}\n${result.stderr}`;

/** Run one command (echoing its output), logging its command line first. */
async function runLogged(
  ctx: ExecutePlanContext,
  run: PlanRun,
  command: string,
  args: string[],
): Promise<void> {
  ctx.log(`$ ${formatCommand(command, args)}`);
  const result = await runChecked(ctx.runner, command, args, {
    echo: true,
    echoFilter: run.noise.filter,
  });
  recordChange(run.report, outputOf(result));
}

/**
 * Apply config operations with `openclaw config set --batch-file`.
 *
 * @param ctx - Execution context.
 * @param run - Plan run state.
 * @param ops - Operations (non-empty).
 * @param redact - Secret values to keep out of logs and errors.
 */
async function runConfigBatch(
  ctx: ExecutePlanContext,
  run: PlanRun,
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
        const result = await runChecked(
          ctx.runner,
          OPENCLAW_BIN,
          configSetBatchFileArgs(path),
          {
            echo: true,
            echoFilter: run.noise.filter,
            ...(redact ? { redact } : {}),
          },
        );
        recordChange(run.report, outputOf(result));
      }),
    ctx.log,
  );
}

/** Execute one step for real. */
async function executeStep(
  step: PlanStep,
  ctx: ExecutePlanContext,
  run: PlanRun,
): Promise<void> {
  switch (step.kind) {
    case 'exec':
      await runLogged(ctx, run, step.command, step.args);
      return;
    case 'pluginInstall': {
      const result = await runPluginInstall(
        waitPorts(ctx),
        run.gateway,
        step,
        run.noise.filter,
      );
      recordChange(run.report, result && outputOf(result));
      run.noise.installed(step.pluginId);
      return;
    }
    case 'configSetBatch':
      await runConfigBatch(ctx, run, step.ops, step.redact);
      run.gateway.reloadPending = true;
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
          runLogged(ctx, run, OPENCLAW_BIN, configUnsetArgs(path)),
        );
      }
      if (repair.setOps.length > 0) {
        await runConfigBatch(ctx, run, repair.setOps);
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
 * @returns Which changes OpenClaw applied live (empty for a dry run).
 */
export async function executePlan(
  steps: readonly PlanStep[],
  ctx: ExecutePlanContext,
): Promise<ApplyReport> {
  const report = emptyApplyReport();
  if (ctx.dryRun) {
    for (const step of steps) {
      for (const line of describeStep(step)) ctx.log(`[dry-run] ${line}`);
    }
    return report;
  }
  const installs = steps.flatMap((s) =>
    s.kind === 'pluginInstall' ? [s.pluginId] : [],
  );
  const run: PlanRun = {
    gateway:
      installs.length > 0
        ? await detectGateway(waitPorts(ctx))
        : { present: false, reloadPending: false },
    noise: createTransientNoise(installs),
    report,
  };
  for (const step of steps) {
    await executeStep(step, ctx, run);
    run.noise.flushNote(ctx.log);
  }
  return report;
}
