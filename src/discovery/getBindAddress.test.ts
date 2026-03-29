import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { init, resetInit } from '../init.js';
import { getBindAddress } from './getBindAddress.js';

describe('getBindAddress', () => {
  let configRoot: string;

  beforeEach(() => {
    const base = join(
      tmpdir(),
      `jeeves-bind-test-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    configRoot = join(base, 'config');
    const workspace = join(base, 'workspace');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(configRoot, 'jeeves-core'), { recursive: true });
    init({ workspacePath: workspace, configRoot });
  });

  afterEach(() => {
    resetInit();
    vi.unstubAllEnvs();
  });

  it('returns default 0.0.0.0 when no config or env', () => {
    expect(getBindAddress()).toBe('0.0.0.0');
  });

  it('reads from core config', () => {
    writeFileSync(
      join(configRoot, 'jeeves-core', 'config.json'),
      JSON.stringify({ bindAddress: '192.168.1.1' }),
    );
    expect(getBindAddress()).toBe('192.168.1.1');
  });

  it('env overrides default but not core config', () => {
    vi.stubEnv('JEEVES_BIND_ADDRESS', '10.0.0.1');
    expect(getBindAddress()).toBe('10.0.0.1');

    // Core config takes priority over env
    writeFileSync(
      join(configRoot, 'jeeves-core', 'config.json'),
      JSON.stringify({ bindAddress: '192.168.1.1' }),
    );
    expect(getBindAddress()).toBe('192.168.1.1');
  });

  it('component config overrides core config', () => {
    writeFileSync(
      join(configRoot, 'jeeves-core', 'config.json'),
      JSON.stringify({ bindAddress: '192.168.1.1' }),
    );
    const componentDir = join(configRoot, 'jeeves-watcher');
    if (!existsSync(componentDir)) mkdirSync(componentDir, { recursive: true });
    writeFileSync(
      join(componentDir, 'config.json'),
      JSON.stringify({ bindAddress: '172.16.0.1' }),
    );
    expect(getBindAddress('watcher')).toBe('172.16.0.1');
  });

  it('falls through tiers correctly', () => {
    // Tier 4: default
    expect(getBindAddress('runner')).toBe('0.0.0.0');

    // Tier 3: env
    vi.stubEnv('JEEVES_BIND_ADDRESS', '10.0.0.1');
    expect(getBindAddress('runner')).toBe('10.0.0.1');

    // Tier 2: core config
    writeFileSync(
      join(configRoot, 'jeeves-core', 'config.json'),
      JSON.stringify({ bindAddress: '192.168.1.1' }),
    );
    expect(getBindAddress('runner')).toBe('192.168.1.1');

    // Tier 1: component config
    const componentDir = join(configRoot, 'jeeves-runner');
    if (!existsSync(componentDir)) mkdirSync(componentDir, { recursive: true });
    writeFileSync(
      join(componentDir, 'config.json'),
      JSON.stringify({ bindAddress: '127.0.0.1' }),
    );
    expect(getBindAddress('runner')).toBe('127.0.0.1');
  });
});
