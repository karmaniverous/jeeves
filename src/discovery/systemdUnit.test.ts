import { describe, expect, it } from 'vitest';

import { execFailure, fakeExec } from '../test/fakeExec';
import {
  execErrorDetail,
  getSystemdServiceState,
  getSystemdServiceStatus,
  hasSystemUnit,
  systemdUnitName,
} from './systemdUnit';

const SHOW =
  'systemctl show jeeves-watcher.service --property=LoadState --value';

describe('systemdUnitName', () => {
  it('appends .service', () => {
    expect(systemdUnitName('jeeves-watcher')).toBe('jeeves-watcher.service');
  });
});

describe('hasSystemUnit', () => {
  it.each(['loaded', 'masked'])('detects a %s system unit', (s) => {
    const { exec, calls } = fakeExec({ [SHOW]: s });
    expect(hasSystemUnit('jeeves-watcher', exec)).toBe(true);
    expect(calls).toEqual([SHOW]);
  });

  it.each(['not-found', 'error', ''])('treats LoadState %j as absent', (s) => {
    const { exec } = fakeExec({ [SHOW]: s });
    expect(hasSystemUnit('jeeves-watcher', exec)).toBe(false);
  });

  it('treats a failing systemctl (no systemd) as absent', () => {
    const { exec } = fakeExec({
      [SHOW]: execFailure('System has not been booted with systemd'),
    });
    expect(hasSystemUnit('jeeves-watcher', exec)).toBe(false);
  });
});

describe('getSystemdServiceState', () => {
  it('reads the system unit when one exists (never --user)', () => {
    const { exec, calls } = fakeExec({
      [SHOW]: 'loaded',
      'systemctl is-active jeeves-watcher.service': 'active',
    });
    expect(getSystemdServiceState('jeeves-watcher', exec)).toBe('running');
    expect(calls.some((c) => c.includes('--user'))).toBe(false);
  });

  it('reports a stopped system unit', () => {
    const { exec } = fakeExec({
      [SHOW]: 'loaded',
      'systemctl is-active jeeves-watcher.service': execFailure('inactive'),
    });
    expect(getSystemdServiceState('jeeves-watcher', exec)).toBe('stopped');
  });

  it('falls back to the user unit', () => {
    const { exec } = fakeExec({
      [SHOW]: 'not-found',
      'systemctl --user is-enabled jeeves-watcher.service': 'enabled',
      'systemctl --user is-active jeeves-watcher.service': 'active',
    });
    expect(getSystemdServiceState('jeeves-watcher', exec)).toBe('running');
  });

  it('reports a stopped user unit', () => {
    const { exec } = fakeExec({
      [SHOW]: 'not-found',
      'systemctl --user is-enabled jeeves-watcher.service': 'enabled',
      'systemctl --user is-active jeeves-watcher.service': 'inactive',
    });
    expect(getSystemdServiceState('jeeves-watcher', exec)).toBe('stopped');
  });

  it('reports not_installed when neither unit exists', () => {
    const { exec } = fakeExec({ [SHOW]: 'not-found' });
    expect(getSystemdServiceState('jeeves-watcher', exec)).toBe(
      'not_installed',
    );
  });
});

describe('getSystemdServiceStatus', () => {
  it('names the system unit it read', () => {
    const { exec } = fakeExec({
      [SHOW]: 'loaded',
      'systemctl is-active jeeves-watcher.service': 'active',
    });
    expect(getSystemdServiceStatus('jeeves-watcher', exec)).toEqual({
      state: 'running',
      installed: true,
      running: true,
      scope: 'system',
      unit: 'jeeves-watcher.service',
    });
  });

  it('names the user unit it read', () => {
    const { exec } = fakeExec({
      [SHOW]: 'not-found',
      'systemctl --user is-enabled jeeves-watcher.service': 'enabled',
      'systemctl --user is-active jeeves-watcher.service': 'active',
    });
    expect(getSystemdServiceStatus('jeeves-watcher', exec)).toEqual({
      state: 'running',
      installed: true,
      running: true,
      scope: 'user',
      unit: 'jeeves-watcher.service',
    });
  });

  it('omits the scope when nothing is installed', () => {
    const { exec } = fakeExec({ [SHOW]: 'not-found' });
    expect(getSystemdServiceStatus('jeeves-watcher', exec)).toEqual({
      state: 'not_installed',
      installed: false,
      running: false,
      unit: 'jeeves-watcher.service',
    });
  });
});

describe('execErrorDetail', () => {
  it('prefers stderr', () => {
    expect(execErrorDetail(execFailure('boom\n'))).toBe('boom');
  });

  it('falls back to the message, then String()', () => {
    expect(execErrorDetail(new Error('msg'))).toBe('msg');
    expect(execErrorDetail('raw')).toBe('raw');
  });
});
