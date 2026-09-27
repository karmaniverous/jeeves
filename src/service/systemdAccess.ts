/**
 * Guarded access to the systemd user and system managers.
 *
 * @remarks
 * - User scope: fail early with an actionable message when there is no user
 *   bus (typical for `useradd --system` accounts without linger), instead of
 *   surfacing systemctl's raw "Failed to connect to bus" error.
 * - System scope: run only plain `systemctl start|stop|restart <unit>`
 *   (no sudo). systemd authorizes the call through polkit over D-Bus, which
 *   also works inside the OpenClaw gateway, whose unit sets
 *   `NoNewPrivileges=yes` (setuid sudo can never elevate there). jeeves-tools
 *   installs the polkit rule that lets the `jeeves` user manage
 *   `jeeves-*.service` units. Core never writes system units, reloads or
 *   enables them.
 */

import { type CommandExec, execErrorDetail } from '../discovery/systemdUnit.js';

/** Host dependencies for systemd access (injectable for tests). */
export interface SystemdDeps {
  /** Command runner; throws on non-zero exit. */
  exec: CommandExec;
  /** Process environment (reads `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `USER`). */
  env: NodeJS.ProcessEnv;
}

/** Lifecycle verbs core may run against a system unit. */
export type SystemVerb = 'start' | 'stop' | 'restart';

/** Output patterns systemctl prints when polkit denies a unit operation. */
const POLKIT_DENIED =
  /authentication required|access denied|not authori[sz]ed|permission denied/i;

function userLabel(env: NodeJS.ProcessEnv): string {
  return env.USER ?? env.LOGNAME ?? 'this user';
}

/**
 * Ensure a systemd user bus is reachable before any `systemctl --user` call.
 *
 * @param unit - Unit being managed (for the message).
 * @param deps - Host dependencies.
 * @throws Error with the cause and remedies when no user bus is available.
 */
export function assertUserBus(unit: string, deps: SystemdDeps): void {
  const user = userLabel(deps.env);
  const noBus = (reason: string, cause?: unknown): Error =>
    new Error(
      [
        `Cannot manage ${unit} as a systemd user unit: ${reason}.`,
        `No system unit named ${unit} exists either.`,
        'Fix one of:',
        `(1) have an administrator provision ${unit} as a system unit in /etc/systemd/system; it is then detected and managed with plain "systemctl" (authorized by the jeeves-tools polkit rule);`,
        `(2) enable a user manager with "sudo loginctl enable-linger ${user}" and retry from a session where XDG_RUNTIME_DIR is set.`,
      ].join(' '),
      { cause },
    );

  if (!deps.env.XDG_RUNTIME_DIR && !deps.env.DBUS_SESSION_BUS_ADDRESS) {
    throw noBus(
      `there is no systemd user bus for "${user}" (XDG_RUNTIME_DIR is not set)`,
    );
  }
  try {
    deps.exec('systemctl --user show-environment');
  } catch (err: unknown) {
    throw noBus(
      `the systemd user bus for "${user}" is unreachable (${execErrorDetail(err)})`,
      err,
    );
  }
}

/**
 * Run a lifecycle verb against an existing system unit.
 *
 * @remarks
 * Runs plain `systemctl <verb> <unit>`; systemd asks polkit whether the
 * caller may manage the unit. There is deliberately no sudo path: the
 * gateway runs with `NoNewPrivileges=yes`, where sudo always fails, and a
 * second privilege mechanism would only hide a missing polkit rule.
 *
 * @param verb - `start`, `stop` or `restart`.
 * @param unit - System unit name.
 * @param deps - Host dependencies.
 * @throws Error naming the missing polkit rule when authorization is denied.
 */
export function runSystemVerb(
  verb: SystemVerb,
  unit: string,
  deps: SystemdDeps,
): void {
  const cmd = `systemctl ${verb} ${unit}`;
  try {
    deps.exec(cmd);
  } catch (err: unknown) {
    const detail = execErrorDetail(err);
    if (POLKIT_DENIED.test(detail)) {
      throw new Error(
        [
          `${unit} is a system unit and "${cmd}" was not authorized (${detail}).`,
          `It needs the polkit rule jeeves-tools installs, which lets user "${userLabel(deps.env)}" manage jeeves-*.service units (org.freedesktop.systemd1.manage-units).`,
          'sudo cannot be used instead: the OpenClaw gateway runs with NoNewPrivileges, so sudo can never elevate.',
          `Ask an administrator to install that rule, or to run "sudo systemctl ${verb} ${unit}" from a login shell.`,
        ].join(' '),
        { cause: err },
      );
    }
    throw new Error(`"${cmd}" failed: ${detail}`, { cause: err });
  }
}
