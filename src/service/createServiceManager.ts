/**
 * Factory for platform-aware service lifecycle management.
 *
 * @remarks
 * Produces a `ServiceManager` that handles install, uninstall, start,
 * stop, restart, and status for system services. Delegates to NSSM
 * (Windows), systemd (Linux), or launchd (macOS) based on platform.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { getEffectiveServiceName } from '../component/descriptor.js';
import {
  getServiceState,
  type ServiceState,
} from '../discovery/getServiceState.js';
import { getComponentConfigDir } from '../init.js';

/** Options for service manager commands that accept a service name override. */
export interface ServiceManagerOptions {
  /** Override the default service name. */
  name?: string;
  /** Override config path for install. */
  configPath?: string;
}

/** Service lifecycle manager produced by the factory. */
export interface ServiceManager {
  /** Install the service with the system service manager. */
  install(options?: ServiceManagerOptions): void;
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
}

/** Exec helper that returns stdout. */
function run(cmd: string): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Exec helper that suppresses errors and returns success boolean. */
function runQuiet(cmd: string): boolean {
  try {
    execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the effective service name from options and descriptor.
 *
 * @param descriptor - Component descriptor.
 * @param options - Optional overrides.
 * @returns The service name to use.
 */
function resolveServiceName(
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
function resolveConfigFilePath(
  descriptor: JeevesComponentDescriptor,
  options?: ServiceManagerOptions,
): string {
  if (options?.configPath) return options.configPath;
  const configDir = getComponentConfigDir(descriptor.name);
  return join(configDir, descriptor.configFileName);
}

/** Build a Windows NSSM service manager. */
function createWindowsManager(
  descriptor: JeevesComponentDescriptor,
): ServiceManager {
  return {
    install(options) {
      const svcName = resolveServiceName(descriptor, options);
      const cfgPath = resolveConfigFilePath(descriptor, options);
      const cmdArgs = descriptor.startCommand(cfgPath);
      const appPath = cmdArgs[0];
      const appArgs = cmdArgs.slice(1).join(' ');

      run(`nssm install ${svcName} ${appPath}`);
      if (appArgs) {
        run(`nssm set ${svcName} AppParameters ${appArgs}`);
      }
      run(`nssm set ${svcName} AppStdout ${join(homedir(), `${svcName}.log`)}`);
      run(`nssm set ${svcName} AppStderr ${join(homedir(), `${svcName}.log`)}`);
      run(`nssm set ${svcName} AppRotateFiles 1`);
      run(`nssm set ${svcName} AppRotateBytes 1048576`);
    },
    uninstall(options) {
      const svcName = resolveServiceName(descriptor, options);
      runQuiet(`nssm stop ${svcName}`);
      run(`nssm remove ${svcName} confirm`);
    },
    start(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`nssm start ${svcName}`);
    },
    stop(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`nssm stop ${svcName}`);
    },
    restart(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`nssm restart ${svcName}`);
    },
    status(options) {
      const svcName = resolveServiceName(descriptor, options);
      return getServiceState(svcName);
    },
  };
}

/**
 * Generate a systemd user unit file.
 *
 * @param svcName - Service name.
 * @param cmdArgs - Command + args array.
 * @returns Unit file content.
 */
function buildSystemdUnit(svcName: string, cmdArgs: string[]): string {
  const execStart = cmdArgs.join(' ');
  return [
    '[Unit]',
    `Description=${svcName}`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${execStart}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
  ].join('\n');
}

/** Build a Linux systemd service manager. */
function createLinuxManager(
  descriptor: JeevesComponentDescriptor,
): ServiceManager {
  const unitDir = join(homedir(), '.config', 'systemd', 'user');

  function unitPath(svcName: string): string {
    return join(unitDir, `${svcName}.service`);
  }

  return {
    install(options) {
      const svcName = resolveServiceName(descriptor, options);
      const cfgPath = resolveConfigFilePath(descriptor, options);
      const cmdArgs = descriptor.startCommand(cfgPath);

      mkdirSync(unitDir, { recursive: true });
      writeFileSync(unitPath(svcName), buildSystemdUnit(svcName, cmdArgs));
      run('systemctl --user daemon-reload');
      run(`systemctl --user enable ${svcName}.service`);
    },
    uninstall(options) {
      const svcName = resolveServiceName(descriptor, options);
      runQuiet(`systemctl --user stop ${svcName}.service`);
      runQuiet(`systemctl --user disable ${svcName}.service`);
      const path = unitPath(svcName);
      if (existsSync(path)) unlinkSync(path);
      runQuiet('systemctl --user daemon-reload');
    },
    start(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`systemctl --user start ${svcName}.service`);
    },
    stop(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`systemctl --user stop ${svcName}.service`);
    },
    restart(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`systemctl --user restart ${svcName}.service`);
    },
    status(options) {
      const svcName = resolveServiceName(descriptor, options);
      return getServiceState(svcName);
    },
  };
}

/**
 * Generate a macOS launchd plist.
 *
 * @param svcName - Service label.
 * @param cmdArgs - Command + args array.
 * @returns Plist XML content.
 */
function buildLaunchdPlist(svcName: string, cmdArgs: string[]): string {
  const argsXml = cmdArgs.map((a) => `    <string>${a}</string>`).join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
    '  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${svcName}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    argsXml,
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>StandardOutPath</key>',
    `  <string>${join(homedir(), 'Library', 'Logs', `${svcName}.log`)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${join(homedir(), 'Library', 'Logs', `${svcName}.log`)}</string>`,
    '</dict>',
    '</plist>',
  ].join('\n');
}

/** Build a macOS launchd service manager. */
function createMacOSManager(
  descriptor: JeevesComponentDescriptor,
): ServiceManager {
  const agentsDir = join(homedir(), 'Library', 'LaunchAgents');

  function plistPath(svcName: string): string {
    return join(agentsDir, `${svcName}.plist`);
  }

  return {
    install(options) {
      const svcName = resolveServiceName(descriptor, options);
      const cfgPath = resolveConfigFilePath(descriptor, options);
      const cmdArgs = descriptor.startCommand(cfgPath);

      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(plistPath(svcName), buildLaunchdPlist(svcName, cmdArgs));
    },
    uninstall(options) {
      const svcName = resolveServiceName(descriptor, options);
      runQuiet(`launchctl unload ${plistPath(svcName)}`);
      const path = plistPath(svcName);
      if (existsSync(path)) unlinkSync(path);
    },
    start(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`launchctl load ${plistPath(svcName)}`);
    },
    stop(options) {
      const svcName = resolveServiceName(descriptor, options);
      run(`launchctl unload ${plistPath(svcName)}`);
    },
    restart(options) {
      const svcName = resolveServiceName(descriptor, options);
      runQuiet(`launchctl unload ${plistPath(svcName)}`);
      run(`launchctl load ${plistPath(svcName)}`);
    },
    status(options) {
      const svcName = resolveServiceName(descriptor, options);
      return getServiceState(svcName);
    },
  };
}

/**
 * Create a platform-aware service manager from a component descriptor.
 *
 * @remarks
 * Detects the current platform and returns a `ServiceManager` that
 * delegates to NSSM (Windows), systemd (Linux), or launchd (macOS).
 *
 * @param descriptor - The component descriptor.
 * @returns A `ServiceManager` for the current platform.
 */
export function createServiceManager(
  descriptor: JeevesComponentDescriptor,
): ServiceManager {
  switch (process.platform) {
    case 'win32':
      return createWindowsManager(descriptor);
    case 'darwin':
      return createMacOSManager(descriptor);
    default:
      return createLinuxManager(descriptor);
  }
}
