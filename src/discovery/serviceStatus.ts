/**
 * Detailed service status: state plus the unit and scope it was read from.
 *
 * @module
 */

import type { ServiceState } from './getServiceState.js';

/** Where a service unit lives. */
export type ServiceScope = 'system' | 'user';

/** Service status, naming the unit it was read from. */
export interface ServiceStatus {
  /** Coarse state (kept for compatibility with `ServiceManager.status`). */
  state: ServiceState;
  /** Whether a unit/service registration was found. */
  installed: boolean;
  /** Whether the service is running. */
  running: boolean;
  /**
   * Scope the status was read from: `system` (e.g. a systemd system unit or
   * a Windows service) or `user` (a systemd user unit or a launchd agent).
   * Absent when nothing is installed.
   */
  scope?: ServiceScope;
  /**
   * Unit that was queried: the systemd unit (`jeeves-runner.service`), the
   * NSSM service name or the launchd label.
   */
  unit: string;
}

/**
 * Build a {@link ServiceStatus} from a state.
 *
 * @param state - Detected state.
 * @param unit - Unit that was queried.
 * @param scope - Scope of the unit; ignored when not installed.
 * @returns The status.
 */
export function serviceStatus(
  state: ServiceState,
  unit: string,
  scope?: ServiceScope,
): ServiceStatus {
  const installed = state !== 'not_installed';
  return {
    state,
    installed,
    running: state === 'running',
    ...(installed && scope ? { scope } : {}),
    unit,
  };
}
