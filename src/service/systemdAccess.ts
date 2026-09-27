/**
 * Guarded access to the systemd user and system managers.
 *
 * @remarks
 * - User scope: fail early with an actionable message when there is no user
 *   bus (typical for `useradd --system` accounts without linger), instead of
 *   surfacing systemctl's raw "Failed to connect to bus" error.
 * - System scope: run only `systemctl start|stop|restart <unit>` through
 *   non-interactive sudo, which is exactly what the jeeves-tools sudoers rule
 *   for the `jeeves` user allows (`/usr/bin/systemctl stop|start|restart|status *`).
 *   Core never writes system units, reloads or enables them.
 */

import { type CommandExec, execErrorDetail } from '../discovery/systemdUnit.js';

/** Host dependencies for systemd access (injectable for tests). */
export interface SystemdDeps {
  /** Command runner; throws on non-zero exit. */
  exec: CommandExec;
  /** Process environment (reads `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `USER`). */
  env: NodeJS.ProcessEnv;
  /** Whether the process runs as root (then sudo is unnecessary). */
  isRoot: () => boolean;
}

/** Lifecycle verbs core may run against a system unit. */
export type SystemVerb = 'start' | 'stop' | 'restart';

/** Output patterns sudo prints when a non-interactive command is refused. */
const SUDO_REFUSED =
  /password is required|not allowed to execute|may not run sudo|not in the sudoers/i;

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
        `(1) have an administrator provision ${unit} as a system unit in /etc/systemd/system; it is then detected and managed with "sudo -n systemctl";`,
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
 * Uses `sudo -n systemctl <verb> <unit>` (plain `systemctl` when root).
 * `-n` makes sudo fail instead of prompting for a password.
 *
 * @param verb - `start`, `stop` or `restart`.
 * @param unit - System unit name.
 * @param deps - Host dependencies.
 * @throws Error naming the missing sudoers rule when sudo refuses.
 */
export function runSystemVerb(
  verb: SystemVerb,
  unit: string,
  deps: SystemdDeps,
): void {
  const root = deps.isRoot();
  const cmd = root
    ? `systemctl ${verb} ${unit}`
    : `sudo -n systemctl ${verb} ${unit}`;
  try {
    deps.exec(cmd);
  } catch (err: unknown) {
    const detail = execErrorDetail(err);
    if (!root && SUDO_REFUSED.test(detail)) {
      throw new Error(
        `${unit} is a system unit and "${cmd}" was refused: passwordless sudo for "/usr/bin/systemctl ${verb} *" is not granted to "${userLabel(deps.env)}" (${detail}). Ask an administrator to run "sudo systemctl ${verb} ${unit}" or to grant that sudoers rule.`,
        { cause: err },
      );
    }
    throw new Error(`"${cmd}" failed: ${detail}`, { cause: err });
  }
}
