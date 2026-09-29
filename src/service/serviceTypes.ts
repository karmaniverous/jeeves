/**
 * Service manager contract and shared option resolution.
 *
 * @remarks
 * Shared by the per-platform managers built in `createServiceManager`
 * and `createLinuxManager`.
 */

import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { getEffectiveServiceName } from '../component/descriptor.js';
import type { ServiceState } from '../discovery/getServiceState.js';
import type { ServiceStatus } from '../discovery/serviceStatus.js';
import { getComponentConfigDir } from '../init.js';

/** Options for service manager commands that accept a service name override. */
export interface ServiceManagerOptions {
  /** Override the default service name. */
  name?: string;
  /** Override config path for install. */
  configPath?: string;
}

/** Outcome of {@link ServiceManager.install}. */
export interface ServiceInstallResult {
  /**
   * True when the service was already provisioned outside core (a Linux
   * system unit) and install was a no-op.
   */
  existing: boolean;
  /** Human-readable summary of what install did. */
  message: string;
}

/** Service lifecycle manager produced by the factory. */
export interface ServiceManager {
  /** Install the service with the system service manager. */
  install(options?: ServiceManagerOptions): ServiceInstallResult;
  /** Uninstall the service from the system service manager. */
  uninstall(options?: ServiceManagerOptions): void;
  /** Start the service. */
  start(options?: ServiceManagerOptions): void;
  /** Stop the service. */
  stop(options?: ServiceManagerOptions): void;
  /** Restart the service (stop + start). */
  restart(options?: ServiceManagerOptions): void;
  /** Query the service state. */
  status(options?: ServiceManagerOptions): ServiceState;
  /** Query the service status, naming the unit and scope it was read from. */
  statusDetail(options?: ServiceManagerOptions): ServiceStatus;
}

/**
 * Resolve the effective service name from options and descriptor.
 *
 * @param descriptor - Component descriptor.
 * @param options - Optional overrides.
 * @returns The service name to use.
 */
export function resolveServiceName(
  descriptor: JeevesComponentDescriptor,
  options?: ServiceManagerOptions,
): string {
  return options?.name ?? getEffectiveServiceName(descriptor);
}

/**
 * Resolve the config path for install.
 *
 * @param descriptor - Component descriptor.
 * @param options - Optional overrides.
 * @returns Absolute config file path.
 */
export function resolveConfigFilePath(
  descriptor: JeevesComponentDescriptor,
  options?: ServiceManagerOptions,
): string {
  if (options?.configPath) return options.configPath;
  const configDir = getComponentConfigDir(descriptor.name);
  return join(configDir, descriptor.configFileName);
}

/**
 * The default install result for a freshly installed service.
 *
 * @param svcName - Service name.
 * @returns A non-existing install result.
 */
export function installedResult(svcName: string): ServiceInstallResult {
  return { existing: false, message: `Service "${svcName}" installed.` };
}
