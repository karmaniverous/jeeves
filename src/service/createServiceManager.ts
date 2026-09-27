/**
 * Factory for platform-aware service lifecycle management.
 *
 * @remarks
 * Produces a `ServiceManager` that handles install, uninstall, start,
 * stop, restart, and status for system services. Delegates to NSSM
 * (Windows), systemd (Linux), or launchd (macOS) based on platform.
 * On Linux an existing system unit is detected and managed in place
 * (see `createLinuxManager`).
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { getServiceState } from '../discovery/getServiceState.js';
import { createLinuxManager } from './linuxManager.js';
import {
  installedResult,
  resolveConfigFilePath,
  resolveServiceName,
  type ServiceManager,
} from './serviceTypes.js';

export type {
  ServiceInstallResult,
  ServiceManager,
  ServiceManagerOptions,
} from './serviceTypes.js';

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
      return installedResult(svcName);
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
      return installedResult(svcName);
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
