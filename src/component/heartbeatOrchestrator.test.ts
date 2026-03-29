import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { init, resetInit } from '../init.js';
import { orchestrateHeartbeat } from './heartbeatOrchestrator.js';

// Mock external dependencies
vi.mock('../plugin/http.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../discovery/getServiceState.js', () => ({
  getServiceState: vi.fn(),
}));

// Import mocked modules for per-test control
const { fetchWithTimeout } = await import('../plugin/http.js');
const { getServiceState } = await import('../discovery/getServiceState.js');

const mockFetch = vi.mocked(fetchWithTimeout);
const mockServiceState = vi.mocked(getServiceState);

describe('heartbeatOrchestrator', () => {
  let configRoot: string;
  let coreConfigDir: string;

  beforeEach(() => {
    const base = join(
      tmpdir(),
      `jeeves-orch-test-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    configRoot = join(base, 'config');
    coreConfigDir = join(configRoot, 'jeeves-core');
    const workspace = join(base, 'workspace');
    mkdirSync(coreConfigDir, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    init({ workspacePath: workspace, configRoot });

    // Default: all fetches fail, all services not installed
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    mockServiceState.mockReturnValue('not_installed');
  });

  afterEach(() => {
    resetInit();
    vi.clearAllMocks();
  });

  it('all components not installed when registry is empty', async () => {
    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(entry.declined).toBe(false);
      expect(entry.content).toContain('Not installed');
    }
  });

  it('preserves declined components', async () => {
    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(['jeeves-runner', 'jeeves-server']),
    });

    const runner = entries.find((e) => e.name === 'jeeves-runner');
    const server = entries.find((e) => e.name === 'jeeves-server');
    expect(runner?.declined).toBe(true);
    expect(runner?.content).toBe('');
    expect(server?.declined).toBe(true);
    expect(server?.content).toBe('');
  });

  it('auto-declines meta when watcher is declined', async () => {
    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(['jeeves-watcher']),
    });

    const meta = entries.find((e) => e.name === 'jeeves-meta');
    expect(meta?.declined).toBe(true);
  });

  it('detects config_missing when plugin installed but no config file', async () => {
    // Register runner in component-versions.json
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ runner: { updatedAt: new Date().toISOString() } }),
    );
    // No config file at configRoot/jeeves-runner/config.json

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const runner = entries.find((e) => e.name === 'jeeves-runner');
    expect(runner?.content).toContain('config');
    expect(runner?.content).toContain('jeeves-runner');
  });

  it('detects service_not_installed when config exists but service missing', async () => {
    // Register runner
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ runner: { updatedAt: new Date().toISOString() } }),
    );
    // Create config file
    const runnerConfigDir = join(configRoot, 'jeeves-runner');
    mkdirSync(runnerConfigDir, { recursive: true });
    writeFileSync(join(runnerConfigDir, 'config.json'), '{}');

    mockServiceState.mockReturnValue('not_installed');

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const runner = entries.find((e) => e.name === 'jeeves-runner');
    expect(runner?.content).toContain('service is not installed');
  });

  it('detects service_stopped when service installed but not running', async () => {
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ runner: { updatedAt: new Date().toISOString() } }),
    );
    const runnerConfigDir = join(configRoot, 'jeeves-runner');
    mkdirSync(runnerConfigDir, { recursive: true });
    writeFileSync(join(runnerConfigDir, 'config.json'), '{}');

    mockServiceState.mockReturnValue('stopped');

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const runner = entries.find((e) => e.name === 'jeeves-runner');
    expect(runner?.content).toContain('not running');
    expect(runner?.content).toContain('service start');
  });

  it('healthy component has no alert content', async () => {
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ runner: { updatedAt: new Date().toISOString() } }),
    );
    const runnerConfigDir = join(configRoot, 'jeeves-runner');
    mkdirSync(runnerConfigDir, { recursive: true });
    writeFileSync(join(runnerConfigDir, 'config.json'), '{}');

    // HTTP probe succeeds
    mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const runner = entries.find((e) => e.name === 'jeeves-runner');
    expect(runner?.content).toBe('');
    expect(runner?.declined).toBe(false);
  });

  it('meta shows deps_missing when watcher not healthy', async () => {
    // Register both meta and watcher
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({
        meta: { updatedAt: new Date().toISOString() },
        watcher: { updatedAt: new Date().toISOString() },
      }),
    );

    // watcher not healthy (fetch fails) → meta deps_missing
    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const meta = entries.find((e) => e.name === 'jeeves-meta');
    expect(meta?.content).toContain('jeeves-watcher');
    expect(meta?.content).toContain('watcher must be installed');
  });

  it('server shows soft-dep alerts when healthy but deps missing', async () => {
    // Register server, make it healthy
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ server: { updatedAt: new Date().toISOString() } }),
    );
    const serverConfigDir = join(configRoot, 'jeeves-server');
    mkdirSync(serverConfigDir, { recursive: true });
    writeFileSync(join(serverConfigDir, 'config.json'), '{}');

    // Server HTTP probe succeeds, others fail
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('1934'))
        return Promise.resolve(new Response('OK', { status: 200 }));
      return Promise.reject(new Error('ECONNREFUSED'));
    });

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set(),
    });

    const server = entries.find((e) => e.name === 'jeeves-server');
    expect(server?.content).toContain('unavailable');
  });

  it('server omits soft-dep alerts for declined deps', async () => {
    writeFileSync(
      join(coreConfigDir, 'component-versions.json'),
      JSON.stringify({ server: { updatedAt: new Date().toISOString() } }),
    );
    const serverConfigDir = join(configRoot, 'jeeves-server');
    mkdirSync(serverConfigDir, { recursive: true });
    writeFileSync(join(serverConfigDir, 'config.json'), '{}');

    mockFetch.mockImplementation((url: string) => {
      if (url.includes('1934'))
        return Promise.resolve(new Response('OK', { status: 200 }));
      return Promise.reject(new Error('ECONNREFUSED'));
    });

    // All soft deps declined
    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames: new Set([
        'jeeves-watcher',
        'jeeves-runner',
        'jeeves-meta',
      ]),
    });

    const server = entries.find((e) => e.name === 'jeeves-server');
    // No soft-dep alerts because all soft deps are declined
    expect(server?.content).toBe('');
  });
});
