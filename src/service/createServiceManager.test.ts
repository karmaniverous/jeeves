import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { init, resetInit } from '../init';
import { makeTestDescriptor } from '../test/makeTestDescriptor';
import { createServiceManager } from './createServiceManager';

describe('createServiceManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-sm-test-${String(Date.now())}`);
    const configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should create a service manager with all methods', () => {
    const manager = createServiceManager(makeTestDescriptor());
    expect(typeof manager.install).toBe('function');
    expect(typeof manager.uninstall).toBe('function');
    expect(typeof manager.start).toBe('function');
    expect(typeof manager.stop).toBe('function');
    expect(typeof manager.restart).toBe('function');
    expect(typeof manager.status).toBe('function');
  });

  it('should query service status', () => {
    const manager = createServiceManager(makeTestDescriptor());
    // On a test system, the service is not installed
    const state = manager.status();
    expect(['not_installed', 'stopped', 'running']).toContain(state);
  });

  it('should use custom service name from options', () => {
    const manager = createServiceManager(makeTestDescriptor());
    const state = manager.status({ name: 'nonexistent-svc-12345' });
    expect(state).toBe('not_installed');
  });

  it('should derive default service name from descriptor', () => {
    const manager = createServiceManager(
      makeTestDescriptor({ serviceName: 'custom-svc' }),
    );
    // Just verify it creates successfully with a custom name
    expect(manager).toBeDefined();
  });
});
