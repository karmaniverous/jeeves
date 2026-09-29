import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { init, resetInit } from '../init';
import { execFailure, fakeExec } from '../test/fakeExec';
import { makeTestDescriptor } from '../test/makeTestDescriptor';
import { useTempDir } from '../test/tempDir';
import { createLinuxManager } from './linuxManager';

const UNIT = 'jeeves-watcher.service';
const SHOW = `systemctl show ${UNIT} --property=LoadState --value`;
const BUS = 'systemctl --user show-environment';
const USER_ENV = { USER: 'jeeves', XDG_RUNTIME_DIR: '/run/user/999' };

describe('createLinuxManager', () => {
  const tempDir = useTempDir('jeeves-linux-sm-');
  let unitDir: string;

  beforeEach(() => {
    const dir = tempDir();
    unitDir = join(dir, 'systemd-user');
    mkdirSync(join(dir, 'config', 'jeeves-watcher'), { recursive: true });
    init({
      workspacePath: join(dir, 'workspace'),
      configRoot: join(dir, 'config'),
    });
  });

  afterEach(() => {
    resetInit();
  });

  function manager(
    script: Record<string, string | Error>,
    env: NodeJS.ProcessEnv = USER_ENV,
  ) {
    const fake = fakeExec(script);
    const svc = createLinuxManager(
      makeTestDescriptor(),
      { exec: fake.exec, env },
      unitDir,
    );
    return { svc, calls: fake.calls };
  }

  describe('with an existing system unit', () => {
    it('install is a no-op reporting the system unit', () => {
      const { svc, calls } = manager({ [SHOW]: 'loaded' }, { USER: 'jeeves' });
      const result = svc.install();
      expect(result.existing).toBe(true);
      expect(result.message).toContain(`system unit ${UNIT}`);
      expect(calls).toEqual([SHOW]);
      expect(existsSync(join(unitDir, UNIT))).toBe(false);
    });

    it('status reads the system unit and names it', () => {
      const { svc } = manager({
        [SHOW]: 'loaded',
        [`systemctl is-active ${UNIT}`]: 'active',
      });
      expect(svc.status()).toBe('running');
      expect(svc.statusDetail()).toEqual({
        state: 'running',
        installed: true,
        running: true,
        scope: 'system',
        unit: UNIT,
      });
    });

    it.each(['start', 'stop', 'restart'] as const)(
      '%s uses plain systemctl without a user bus',
      (verb) => {
        const cmd = `systemctl ${verb} ${UNIT}`;
        const { svc, calls } = manager(
          { [SHOW]: 'loaded', [cmd]: '' },
          { USER: 'jeeves' },
        );
        svc[verb]();
        expect(calls).toEqual([SHOW, cmd]);
      },
    );

    it('surfaces a polkit denial naming the missing rule', () => {
      const { svc } = manager({
        [SHOW]: 'loaded',
        [`systemctl stop ${UNIT}`]: execFailure(
          'Failed to stop jeeves-watcher.service: Interactive authentication required.',
        ),
      });
      expect(() => {
        svc.stop();
      }).toThrow(/polkit rule.*NoNewPrivileges/);
    });

    it('uninstall refuses to touch the system unit', () => {
      const { svc, calls } = manager({ [SHOW]: 'loaded' });
      expect(() => {
        svc.uninstall();
      }).toThrow(/core will not remove it/);
      expect(calls).toEqual([SHOW]);
    });
  });

  describe('without a system unit or user bus', () => {
    it.each(['install', 'uninstall', 'start', 'stop', 'restart'] as const)(
      '%s fails early with an actionable message',
      (action) => {
        const { svc, calls } = manager(
          { [SHOW]: 'not-found' },
          { USER: 'jeeves' },
        );
        expect(() => {
          svc[action]();
        }).toThrow(/XDG_RUNTIME_DIR is not set.*enable-linger jeeves/);
        expect(calls).toEqual([SHOW]);
      },
    );

    it('status reports not_installed', () => {
      const { svc } = manager({ [SHOW]: 'not-found' }, { USER: 'jeeves' });
      expect(svc.status()).toBe('not_installed');
      expect(svc.statusDetail()).toEqual({
        state: 'not_installed',
        installed: false,
        running: false,
        unit: UNIT,
      });
    });
  });

  describe('with a user bus (plain user unit)', () => {
    it('install writes and enables a user unit', () => {
      const { svc, calls } = manager({
        [SHOW]: 'not-found',
        [BUS]: '',
        'systemctl --user daemon-reload': '',
        [`systemctl --user enable ${UNIT}`]: '',
      });
      expect(svc.install()).toEqual({
        existing: false,
        message: 'Service "jeeves-watcher" installed.',
      });
      expect(calls).toEqual([
        SHOW,
        BUS,
        'systemctl --user daemon-reload',
        `systemctl --user enable ${UNIT}`,
      ]);
      const unit = readFileSync(join(unitDir, UNIT), 'utf-8');
      expect(unit).toContain('WantedBy=default.target');
      expect(unit).toContain('ExecStart=');
    });

    it.each(['start', 'stop', 'restart'] as const)(
      '%s uses systemctl --user',
      (verb) => {
        const cmd = `systemctl --user ${verb} ${UNIT}`;
        const { svc, calls } = manager({
          [SHOW]: 'not-found',
          [BUS]: '',
          [cmd]: '',
        });
        svc[verb]();
        expect(calls).toEqual([SHOW, BUS, cmd]);
      },
    );

    it('status names the user unit', () => {
      const { svc } = manager({
        [SHOW]: 'not-found',
        [`systemctl --user is-enabled ${UNIT}`]: 'enabled',
        [`systemctl --user is-active ${UNIT}`]: 'inactive',
      });
      expect(svc.statusDetail()).toEqual({
        state: 'stopped',
        installed: true,
        running: false,
        scope: 'user',
        unit: UNIT,
      });
    });

    it('uninstall stops, disables and removes the user unit', () => {
      mkdirSync(unitDir, { recursive: true });
      writeFileSync(join(unitDir, UNIT), '[Unit]');
      const { svc, calls } = manager({
        [SHOW]: 'not-found',
        [BUS]: '',
        [`systemctl --user stop ${UNIT}`]: execFailure('not loaded'),
        [`systemctl --user disable ${UNIT}`]: '',
        'systemctl --user daemon-reload': '',
      });
      svc.uninstall();
      expect(existsSync(join(unitDir, UNIT))).toBe(false);
      expect(calls).toHaveLength(5);
    });
  });
});
