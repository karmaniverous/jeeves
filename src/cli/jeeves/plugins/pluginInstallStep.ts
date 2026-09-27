/**
 * Run one `openclaw plugins install` so that a gateway stalled by config hot
 * reloads neither breaks it nor hides its outcome.
 *
 * @remarks
 * Every plugin install (and every config write) makes a running gateway hot
 * reload, and OpenClaw v2026.9.6 stalls its event loop for 20-33 s per reload
 * while it re-captures every non-bundled plugin (upstream bug
 * https://github.com/openclaw/openclaw/issues/159698; this module is the
 * workaround). Reloads stack, so:
 *
 * - Before the plan runs, one probe detects whether a gateway is running
 *   ({@link detectGateway}). Only then does each install first wait until the
 *   gateway answers again ({@link settleGateway}); after a config write it
 *   pauses briefly first so that write's reload has started.
 * - An install that exits non-zero with a gateway-disconnect signature
 *   (WebSocket close 1006, `gateway closed`, or the transient
 *   `upgrade is unfinished` migration warning) does not fail at once: the
 *   gateway usually completes it seconds later. The step waits (bounded,
 *   backoff) for the gateway to answer, then checks `plugins list --json` for
 *   the plugin, enabled, at the requested version. Verified: warn and
 *   continue. Otherwise fail, naming the plugin and what was observed.
 * - Any other failure (npm 404, unknown version, ...) fails at once, also
 *   when a disconnect signature appears next to it.
 *
 * @module
 */

import { formatCommand } from './commandLine.js';
import { CommandFailedError, runChecked } from './commandRunner.js';
import {
  type GatewayWaitPorts,
  pollUntil,
  probeGateway,
  waitForGateway,
} from './gatewayWait.js';
import { OPENCLAW_BIN, pluginInstallArgs } from './openclawCommands.js';
import { verifyInstalled } from './pluginVerify.js';

/** What the install step needs to know about one plugin. */
export interface PluginInstallTarget {
  /** OpenClaw plugin id. */
  pluginId: string;
  /** Scoped npm package name. */
  packageName: string;
  /** Exact version. */
  version: string;
}

/** Gateway state tracked across one plan run. */
export interface GatewayTracker {
  /** A gateway answered before the plan ran (settle waits apply). */
  present: boolean;
  /** A config write happened since the last install (its reload may be pending). */
  reloadPending: boolean;
}

const DISCONNECT = /\b1006\b|gateway closed|upgrade is unfinished/i;
const GENUINE =
  /\bE404\b|404 Not Found|\bETARGET\b|No matching version|is not in this registry|\bENOTFOUND\b|\bEINTEGRITY\b/i;

/**
 * Whether a failed install looks like a lost gateway connection (and not
 * like a genuine install failure).
 *
 * @param error - The thrown value.
 * @returns `true` for a disconnect signature without a genuine failure.
 */
export function isGatewayDisconnect(
  error: unknown,
): error is CommandFailedError {
  if (!(error instanceof CommandFailedError)) return false;
  const text = `${error.result.stderr}\n${error.result.stdout}`;
  return DISCONNECT.test(text) && !GENUINE.test(text);
}

const seconds = (ms: number): string => `${String(Math.round(ms / 1000))}s`;

const label = (t: PluginInstallTarget): string => `${t.pluginId}@${t.version}`;

/**
 * Probe once for a running gateway.
 *
 * @param ports - Wait ports.
 * @returns The tracker for the plan run.
 */
export async function detectGateway(
  ports: GatewayWaitPorts,
): Promise<GatewayTracker> {
  const observed = await probeGateway(ports.runner);
  if (observed !== undefined) {
    ports.log(
      `no running OpenClaw gateway answered (${observed}); installing without gateway settle waits`,
    );
  }
  return { present: observed === undefined, reloadPending: false };
}

/**
 * Wait until the gateway answers before an install.
 *
 * @param ports - Wait ports.
 * @param gateway - Tracker.
 * @param target - The plugin about to be installed.
 * @throws Error when the gateway does not answer within the budget.
 */
export async function settleGateway(
  ports: GatewayWaitPorts,
  gateway: GatewayTracker,
  target: PluginInstallTarget,
): Promise<void> {
  const start = ports.clock();
  if (gateway.reloadPending) await ports.sleep(ports.policy.reloadGraceMs);
  const outcome = await waitForGateway(
    ports,
    start + ports.policy.budgetMs,
    (observed, n) => {
      if (n === 1) {
        ports.log(
          `OpenClaw gateway is busy (${observed}); waiting up to ${seconds(ports.policy.budgetMs)} before installing ${label(target)}`,
        );
      }
    },
  );
  if (!outcome.ok) {
    throw new Error(
      `OpenClaw gateway did not answer within ${seconds(ports.clock() - start)} before installing ${label(target)} (last probe: ${outcome.observed}). Check "openclaw gateway status", then rerun the command.`,
    );
  }
}

/**
 * After an install lost its gateway connection: wait for the gateway, then
 * verify the plugin.
 *
 * @param ports - Wait ports.
 * @param target - The plugin.
 * @param error - The install failure.
 * @throws Error naming the plugin and what was observed when it cannot be
 *   verified within the budget.
 */
async function recoverDisconnectedInstall(
  ports: GatewayWaitPorts,
  target: PluginInstallTarget,
  error: CommandFailedError,
): Promise<void> {
  const start = ports.clock();
  const deadline = start + ports.policy.budgetMs;
  ports.log(
    `warning: installing ${label(target)} lost its OpenClaw gateway connection; waiting up to ${seconds(ports.policy.budgetMs)} for the gateway, then verifying the install`,
  );
  const fail = (what: string): Error =>
    new Error(
      `Installing ${label(target)} lost its OpenClaw gateway connection and could not be verified after ${seconds(ports.clock() - start)}: ${what}. Check "openclaw plugins list", then rerun the command.`,
      { cause: error },
    );
  const gateway = await waitForGateway(ports, deadline);
  if (!gateway.ok) {
    throw fail(`the gateway did not answer (last probe: ${gateway.observed})`);
  }
  const verified = await pollUntil(ports, deadline, async () => {
    const check = await verifyInstalled(
      ports.runner,
      target.pluginId,
      target.version,
    );
    return check.ok
      ? { done: true, value: undefined }
      : { done: false, observed: check.observed };
  });
  if (!verified.ok) throw fail(`plugin ${verified.observed}`);
  ports.log(
    `warning: ${label(target)} is installed and enabled although its install lost the gateway connection; continuing`,
  );
}

/**
 * Run one plugin install: settle, install, recover from a lost connection.
 *
 * @param ports - Wait ports.
 * @param gateway - Tracker (updated).
 * @param target - The plugin.
 */
export async function runPluginInstall(
  ports: GatewayWaitPorts,
  gateway: GatewayTracker,
  target: PluginInstallTarget,
): Promise<void> {
  if (gateway.present) await settleGateway(ports, gateway, target);
  const args = pluginInstallArgs(target.packageName, target.version);
  ports.log(`$ ${formatCommand(OPENCLAW_BIN, args)}`);
  try {
    await runChecked(ports.runner, OPENCLAW_BIN, args, { echo: true });
  } catch (error) {
    if (!isGatewayDisconnect(error)) throw error;
    await recoverDisconnectedInstall(ports, target, error);
    gateway.present = true;
  }
  gateway.reloadPending = false;
}
