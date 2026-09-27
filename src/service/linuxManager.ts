/**
 * Linux systemd service manager.
 *
 * @remarks
 * Two scopes:
 * - **System unit present** (e.g. `/etc/systemd/system/jeeves-watcher.service`
 *   provisioned by jeeves-tools): install is a no-op that reports the unit,
 *   uninstall refuses, status reads the system unit, and start/stop/restart
 *   run `sudo -n systemctl <verb> <unit>`. Core never creates a competing
 *   user unit.
 * - **Otherwise**: a user unit in `~/.config/systemd/user` managed with
 *   `systemctl --user`, after checking that a user bus exists.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import {
  type CommandExec,
  defaultExec,
  getSystemdServiceState,
  hasSystemUnit,
  systemdUnitName,
} from '../discovery/systemdUnit.js';
import {
  installedResult,
  resolveConfigFilePath,
  resolveServiceName,
  type ServiceManager,
  type ServiceManagerOptions,
} from './serviceTypes.js';
import {
  assertUserBus,
  runSystemVerb,
  type SystemdDeps,
  type SystemVerb,
} from './systemdAccess.js';

/**
 * Generate a systemd user unit file.
 *
 * @param svcName - Service name.
 * @param cmdArgs - Command + args array.
 * @returns Unit file content.
 */
function buildSystemdUnit(svcName: string, cmdArgs: string[]): string {
  return [
    '[Unit]',
    `Description=${svcName}`,
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${cmdArgs.join(' ')}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
  ].join('\n');
}

/** Default host dependencies. */
function defaultDeps(): SystemdDeps {
  return {
    exec: defaultExec,
    env: process.env,
    isRoot: () => process.getuid?.() === 0,
  };
}

/**
 * Build a Linux systemd service manager.
 *
 * @param descriptor - Component descriptor.
 * @param deps - Host dependencies (defaults to the real host).
 * @param unitDir - User unit directory (defaults to `~/.config/systemd/user`).
 * @returns A `ServiceManager` for Linux.
 */
export function createLinuxManager(
  descriptor: JeevesComponentDescriptor,
  deps: SystemdDeps = defaultDeps(),
  unitDir: string = join(homedir(), '.config', 'systemd', 'user'),
): ServiceManager {
  const exec: CommandExec = deps.exec;

  function unitPath(svcName: string): string {
    return join(unitDir, systemdUnitName(svcName));
  }

  /** Run a lifecycle verb in whichever scope owns the unit. */
  function lifecycle(verb: SystemVerb, options?: ServiceManagerOptions): void {
    const svcName = resolveServiceName(descriptor, options);
    const unit = systemdUnitName(svcName);
    if (hasSystemUnit(svcName, exec)) {
      runSystemVerb(verb, unit, deps);
      return;
    }
    assertUserBus(unit, deps);
    exec(`systemctl --user ${verb} ${unit}`);
  }

  return {
    install(options) {
      const svcName = resolveServiceName(descriptor, options);
      const unit = systemdUnitName(svcName);
      if (hasSystemUnit(svcName, exec)) {
        return {
          existing: true,
          message: `Service "${svcName}" is already installed as system unit ${unit}; nothing to do. Manage it with start/stop/restart (sudo -n systemctl).`,
        };
      }
      assertUserBus(unit, deps);

      const cmdArgs = descriptor.startCommand(
        resolveConfigFilePath(descriptor, options),
      );
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(unitPath(svcName), buildSystemdUnit(svcName, cmdArgs));
      exec('systemctl --user daemon-reload');
      exec(`systemctl --user enable ${unit}`);
      return installedResult(svcName);
    },
    uninstall(options) {
      const svcName = resolveServiceName(descriptor, options);
      const unit = systemdUnitName(svcName);
      if (hasSystemUnit(svcName, exec)) {
        throw new Error(
          `${unit} is a system unit provisioned outside core; core will not remove it. Ask an administrator to disable and delete it.`,
        );
      }
      assertUserBus(unit, deps);
      const quiet = (cmd: string): void => {
        try {
          exec(cmd);
        } catch {
          // Best effort: the unit may already be stopped or disabled.
        }
      };
      quiet(`systemctl --user stop ${unit}`);
      quiet(`systemctl --user disable ${unit}`);
      const path = unitPath(svcName);
      if (existsSync(path)) unlinkSync(path);
      quiet('systemctl --user daemon-reload');
    },
    start(options) {
      lifecycle('start', options);
    },
    stop(options) {
      lifecycle('stop', options);
    },
    restart(options) {
      lifecycle('restart', options);
    },
    status(options) {
      return getSystemdServiceState(
        resolveServiceName(descriptor, options),
        exec,
      );
    },
  };
}
