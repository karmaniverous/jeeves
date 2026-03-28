/**
 * Platform-aware service state detection.
 *
 * @remarks
 * Detects whether a system service is installed and running.
 * Delegates to NSSM (Windows), systemd (Linux), or launchd (macOS).
 */

import { execSync } from 'node:child_process';

/** Service states returned by getServiceState. */
export type ServiceState = 'not_installed' | 'stopped' | 'running';

/**
 * Detect the state of a system service by name.
 *
 * @param serviceName - The service name (e.g., 'jeeves-runner').
 * @returns The detected service state.
 */
export function getServiceState(serviceName: string): ServiceState {
  switch (process.platform) {
    case 'win32':
      return getServiceStateWindows(serviceName);
    case 'darwin':
      return getServiceStateMacOS(serviceName);
    default:
      return getServiceStateLinux(serviceName);
  }
}

/**
 * Windows: detect via NSSM.
 * - Exit code 3 = service does not exist
 * - "SERVICE_RUNNING" in output = running
 * - Other output = stopped/paused
 */
function getServiceStateWindows(serviceName: string): ServiceState {
  try {
    const output = execSync(`nssm status ${serviceName}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (output.includes('SERVICE_RUNNING')) return 'running';
    return 'stopped';
  } catch (err: unknown) {
    // NSSM exits with code 3 when the service doesn't exist
    if (isExecError(err) && err.status === 3) return 'not_installed';
    // Any other error (nssm not found, timeout, etc.) — treat as not installed
    return 'not_installed';
  }
}

/**
 * Linux: detect via systemd user services.
 * - `systemctl --user is-enabled {name}.service` exits non-zero = not installed
 * - `systemctl --user is-active {name}.service` returns "active" = running
 */
function getServiceStateLinux(serviceName: string): ServiceState {
  try {
    execSync(`systemctl --user is-enabled ${serviceName}.service`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return 'not_installed';
  }

  try {
    const output = execSync(
      `systemctl --user is-active ${serviceName}.service`,
      {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();

    if (output === 'active') return 'running';
    return 'stopped';
  } catch {
    return 'stopped';
  }
}

/**
 * macOS: detect via launchctl.
 * - `launchctl list {name}` exits non-zero = not installed
 * - PID column is `-` or `0` = stopped
 */
function getServiceStateMacOS(serviceName: string): ServiceState {
  try {
    const output = execSync(`launchctl list ${serviceName}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // launchctl list output includes a PID field; if it's a number > 0, running
    const pidMatch = /^(\d+)\s/m.exec(output);
    if (pidMatch && Number(pidMatch[1]) > 0) return 'running';
    return 'stopped';
  } catch {
    return 'not_installed';
  }
}

/** Type guard for execSync errors with a status code. */
function isExecError(err: unknown): err is { status: number } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  );
}
