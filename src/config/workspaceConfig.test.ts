import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadWorkspaceConfig,
  resolveConfigValue,
  WORKSPACE_CONFIG_DEFAULTS,
  WORKSPACE_CONFIG_FILE,
} from './workspaceConfig.js';

describe('loadWorkspaceConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-wsc-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns undefined when file does not exist', () => {
    expect(loadWorkspaceConfig(testDir)).toBeUndefined();
  });

  it('parses a valid namespaced config file', () => {
    const config = {
      core: { gatewayUrl: 'http://localhost:4000' },
      memory: { budget: 30_000 },
    };
    writeFileSync(join(testDir, WORKSPACE_CONFIG_FILE), JSON.stringify(config));

    const result = loadWorkspaceConfig(testDir);
    expect(result).toBeDefined();
    expect(result?.core?.gatewayUrl).toBe('http://localhost:4000');
    expect(result?.memory?.budget).toBe(30_000);
  });

  it('returns undefined and warns for corrupt JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(join(testDir, WORKSPACE_CONFIG_FILE), 'not json');
    expect(loadWorkspaceConfig(testDir)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('failed to load');
    warnSpy.mockRestore();
  });

  it('returns undefined and warns for invalid schema', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeFileSync(
      join(testDir, WORKSPACE_CONFIG_FILE),
      JSON.stringify({ memory: { budget: -5 } }),
    );
    expect(loadWorkspaceConfig(testDir)).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('accepts an empty config object', () => {
    writeFileSync(join(testDir, WORKSPACE_CONFIG_FILE), '{}');
    const result = loadWorkspaceConfig(testDir);
    expect(result).toBeDefined();
    expect(result?.core?.gatewayUrl).toBeUndefined();
  });

  it('accepts config with $schema pointer', () => {
    writeFileSync(
      join(testDir, WORKSPACE_CONFIG_FILE),
      JSON.stringify({
        $schema: './jeeves.config.schema.json',
        core: { gatewayUrl: 'http://localhost:3000' },
      }),
    );
    const result = loadWorkspaceConfig(testDir);
    expect(result?.$schema).toBe('./jeeves.config.schema.json');
    expect(result?.core?.gatewayUrl).toBe('http://localhost:3000');
  });
});

describe('resolveConfigValue', () => {
  it('returns flag value when all sources present', () => {
    const result = resolveConfigValue('flag', 'env', 'file', 'default');
    expect(result).toEqual({ value: 'flag', provenance: 'flag' });
  });

  it('returns env value when no flag', () => {
    const result = resolveConfigValue(undefined, 'env', 'file', 'default');
    expect(result).toEqual({ value: 'env', provenance: 'env' });
  });

  it('returns file value when no flag or env', () => {
    const result = resolveConfigValue(undefined, undefined, 'file', 'default');
    expect(result).toEqual({ value: 'file', provenance: 'file' });
  });

  it('returns default when no other sources', () => {
    const result = resolveConfigValue(
      undefined,
      undefined,
      undefined,
      'default',
    );
    expect(result).toEqual({ value: 'default', provenance: 'default' });
  });

  it('treats 0 as a valid value', () => {
    const result = resolveConfigValue(0, 1, 2, 3);
    expect(result).toEqual({ value: 0, provenance: 'flag' });
  });
});

describe('WORKSPACE_CONFIG_DEFAULTS', () => {
  it('has expected default values', () => {
    expect(WORKSPACE_CONFIG_DEFAULTS.memory.budget).toBe(20_000);
    expect(WORKSPACE_CONFIG_DEFAULTS.memory.warningThreshold).toBe(0.8);
    expect(WORKSPACE_CONFIG_DEFAULTS.memory.staleDays).toBe(30);
    expect(WORKSPACE_CONFIG_DEFAULTS.core.gatewayUrl).toBe(
      'http://127.0.0.1:3000',
    );
    expect(WORKSPACE_CONFIG_DEFAULTS.core.workspace).toBe('.');
    expect(WORKSPACE_CONFIG_DEFAULTS.core.configRoot).toBe('./config');
  });
});
