import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORKSPACE_CONFIG_DEFAULTS,
  WORKSPACE_CONFIG_FILE,
} from '../../config/index.js';
import { resetInit } from '../../init.js';
import { buildEffectiveConfig } from './configCommand.js';

describe('buildEffectiveConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-cfg-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns defaults when no file or env or flags', () => {
    const result = buildEffectiveConfig({ workspace: testDir });
    expect(result.core.workspace).toEqual({
      value: testDir,
      provenance: 'flag',
    });
    expect(result.core.configRoot).toEqual({
      value: WORKSPACE_CONFIG_DEFAULTS.core.configRoot,
      provenance: 'default',
    });
    expect(result.memory.budget).toEqual({
      value: WORKSPACE_CONFIG_DEFAULTS.memory.budget,
      provenance: 'default',
    });
  });

  it('reads values from jeeves.config.json', () => {
    writeFileSync(
      join(testDir, WORKSPACE_CONFIG_FILE),
      JSON.stringify({
        core: { gatewayUrl: 'http://custom:5000' },
        memory: { budget: 50_000 },
      }),
    );

    const result = buildEffectiveConfig({ workspace: testDir });
    expect(result.core.gatewayUrl).toEqual({
      value: 'http://custom:5000',
      provenance: 'file',
    });
    expect(result.memory.budget).toEqual({
      value: 50_000,
      provenance: 'file',
    });
  });

  it('env vars override file values', () => {
    writeFileSync(
      join(testDir, WORKSPACE_CONFIG_FILE),
      JSON.stringify({ core: { gatewayUrl: 'http://file:5000' } }),
    );
    vi.stubEnv('JEEVES_GATEWAY_URL', 'http://env:6000');

    const result = buildEffectiveConfig({ workspace: testDir });
    expect(result.core.gatewayUrl).toEqual({
      value: 'http://env:6000',
      provenance: 'env',
    });
  });

  it('flags override env and file values', () => {
    vi.stubEnv('JEEVES_CONFIG_ROOT', 'J:/env-config');
    writeFileSync(
      join(testDir, WORKSPACE_CONFIG_FILE),
      JSON.stringify({ core: { configRoot: 'J:/file-config' } }),
    );

    const result = buildEffectiveConfig({
      workspace: testDir,
      configRoot: 'J:/flag-config',
    });
    expect(result.core.configRoot).toEqual({
      value: 'J:/flag-config',
      provenance: 'flag',
    });
  });

  it('coerces numeric env vars', () => {
    vi.stubEnv('JEEVES_MEMORY_BUDGET', '50000');

    const result = buildEffectiveConfig({ workspace: testDir });
    expect(result.memory.budget).toEqual({
      value: 50_000,
      provenance: 'env',
    });
  });

  it('ignores non-numeric env var for numeric fields', () => {
    vi.stubEnv('JEEVES_MEMORY_BUDGET', 'not-a-number');

    const result = buildEffectiveConfig({ workspace: testDir });
    expect(result.memory.budget.provenance).toBe('default');
  });
});
