/**
 * Linux systemd unit detection and state queries.
 *
 * @remarks
 * A service can be provisioned either as a system unit
 * (`/etc/systemd/system/<name>.service`, as jeeves-tools does on managed
 * instances) or as a user unit (`~/.config/systemd/user`, as
 * `createServiceManager` does elsewhere). An existing system unit always
 * wins: status reads it and core never creates a competing user unit.
 *
 * Every query here is unprivileged. Commands run through an injectable
 * `CommandExec` so the logic can be unit tested without systemd.
 */

import { execSync } from 'node:child_process';

import type { ServiceState } from './getServiceState.js';
import { type ServiceStatus, serviceStatus } from './serviceStatus.js';

/**
 * Runs a shell command and returns its trimmed stdout.
 *
 * @remarks
 * Must throw when the command exits non-zero (as `execSync` does).
 */
export type CommandExec = (cmd: string) => string;

/** Default `CommandExec`: `execSync` with piped stdio and a timeout. */
export const defaultExec: CommandExec = (cmd) =>
  execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

/**
 * Extract the most useful text from a failed command.
 *
 * @param err - Error thrown by a `CommandExec`.
 * @returns The command's stderr when present, else the error message.
 */
export function execErrorDetail(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    if ('stderr' in err) {
      const stderr = String(err.stderr).trim();
      if (stderr) return stderr;
    }
    if (err instanceof Error) return err.message;
  }
  return String(err);
}

/**
 * The systemd unit name for a service.
 *
 * @param serviceName - Service name, e.g. `jeeves-watcher`.
 * @returns The unit name, e.g. `jeeves-watcher.service`.
 */
export function systemdUnitName(serviceName: string): string {
  return `${serviceName}.service`;
}

/**
 * LoadStates meaning a system unit exists. A masked unit still counts: an
 * administrator disabled it, and a user unit must not replace it.
 */
const SYSTEM_UNIT_PRESENT = new Set(['loaded', 'masked']);

/**
 * Whether a system-level systemd unit exists for the service.
 *
 * @remarks
 * Queries the system manager (no `--user`, no sudo):
 * `systemctl show <unit> --property=LoadState --value` prints `loaded`
 * (or `masked`) for an existing unit and `not-found` otherwise. Any failure (no
 * systemd, no system bus) means no usable system unit.
 *
 * @param serviceName - Service name.
 * @param exec - Command runner.
 * @returns True when a system unit is loaded.
 */
export function hasSystemUnit(
  serviceName: string,
  exec: CommandExec = defaultExec,
): boolean {
  try {
    const loadState = exec(
      `systemctl show ${systemdUnitName(serviceName)} --property=LoadState --value`,
    );
    return SYSTEM_UNIT_PRESENT.has(loadState.trim());
  } catch {
    return false;
  }
}

/**
 * Read a unit's active state and map it to a `ServiceState`.
 *
 * @param scopeFlag - `''` for the system manager, `'--user '` for the user manager.
 * @param unit - Unit name.
 * @param exec - Command runner.
 * @returns `running` when active, else `stopped`.
 */
function activeState(
  scopeFlag: string,
  unit: string,
  exec: CommandExec,
): ServiceState {
  try {
    return exec(`systemctl ${scopeFlag}is-active ${unit}`) === 'active'
      ? 'running'
      : 'stopped';
  } catch {
    // is-active exits non-zero for inactive/failed units.
    return 'stopped';
  }
}

/**
 * Detect the status of a Linux systemd service, naming the unit it read.
 *
 * @remarks
 * System unit first (`systemctl is-active <unit>`), then the user unit
 * (`systemctl --user is-enabled` / `is-active`). `scope` is set only when a
 * unit was found.
 *
 * @param serviceName - Service name.
 * @param exec - Command runner.
 * @returns The detected status with the unit and scope it came from.
 */
export function getSystemdServiceStatus(
  serviceName: string,
  exec: CommandExec = defaultExec,
): ServiceStatus {
  const unit = systemdUnitName(serviceName);
  if (hasSystemUnit(serviceName, exec)) {
    return serviceStatus(activeState('', unit, exec), unit, 'system');
  }

  try {
    exec(`systemctl --user is-enabled ${unit}`);
  } catch {
    return serviceStatus('not_installed', unit);
  }
  return serviceStatus(activeState('--user ', unit, exec), unit, 'user');
}

/**
 * Detect the state of a Linux systemd service.
 *
 * @param serviceName - Service name.
 * @param exec - Command runner.
 * @returns The detected service state (see {@link getSystemdServiceStatus}).
 */
export function getSystemdServiceState(
  serviceName: string,
  exec: CommandExec = defaultExec,
): ServiceState {
  return getSystemdServiceStatus(serviceName, exec).state;
}
