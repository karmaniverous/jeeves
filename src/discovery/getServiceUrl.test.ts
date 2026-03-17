import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { init, resetInit } from '../init';
import { getServiceUrl } from './getServiceUrl';

describe('getServiceUrl', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-svc-test-${String(Date.now())}`);
    configDir = join(testDir, 'config');
    mkdirSync(configDir, { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should fall back to port constants for known services', () => {
    expect(getServiceUrl('watcher')).toBe('http://127.0.0.1:1936');
    expect(getServiceUrl('runner')).toBe('http://127.0.0.1:1937');
    expect(getServiceUrl('server')).toBe('http://127.0.0.1:1934');
    expect(getServiceUrl('meta')).toBe('http://127.0.0.1:1938');
  });

  it('should throw for unknown service with no config', () => {
    expect(() => getServiceUrl('unknown')).toThrow('unknown service');
  });

  it('should resolve from core config', () => {
    const coreDir = join(configDir, 'jeeves-core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(
      join(coreDir, 'config.json'),
      JSON.stringify({
        services: {
          watcher: { url: 'http://custom-host:9999' },
        },
      }),
    );

    expect(getServiceUrl('watcher')).toBe('http://custom-host:9999');
  });

  it('should resolve from consumer config over core config', () => {
    // Core config
    const coreDir = join(configDir, 'jeeves-core');
    mkdirSync(coreDir, { recursive: true });
    writeFileSync(
      join(coreDir, 'config.json'),
      JSON.stringify({
        services: {
          watcher: { url: 'http://core-host:1111' },
        },
      }),
    );

    // Consumer config
    const consumerDir = join(configDir, 'jeeves-runner');
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(
      join(consumerDir, 'config.json'),
      JSON.stringify({
        services: {
          watcher: { url: 'http://consumer-host:2222' },
        },
      }),
    );

    expect(getServiceUrl('watcher', 'runner')).toBe(
      'http://consumer-host:2222',
    );
  });

  it('should fall through from consumer to core to defaults', () => {
    // Consumer config exists but doesn't have this service
    const consumerDir = join(configDir, 'jeeves-runner');
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(
      join(consumerDir, 'config.json'),
      JSON.stringify({ services: {} }),
    );

    expect(getServiceUrl('watcher', 'runner')).toBe('http://127.0.0.1:1936');
  });
});
