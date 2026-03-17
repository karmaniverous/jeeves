/**
 * Tests for HTTP health probing.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { init, resetInit } from '../init.js';
import { probeAllServices, probeService } from './probe.js';

describe('probe', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-probe-test-${String(Date.now())}`);
    mkdirSync(join(testDir, 'config'), { recursive: true });
    init({
      workspacePath: join(testDir, 'workspace'),
      configRoot: join(testDir, 'config'),
    });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return a valid probe result', async () => {
    const result = await probeService('server', undefined, 200);
    expect(result.name).toBe('server');
    expect(typeof result.healthy).toBe('boolean');
  }, 10_000);

  it('should return port from default constants', async () => {
    const result = await probeService('server', undefined, 200);
    expect(result.port).toBe(1934);
  }, 10_000);

  it('should probe all services', async () => {
    const results = await probeAllServices(undefined, 200);
    expect(results).toHaveLength(4);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['meta', 'runner', 'server', 'watcher']);
  }, 15_000);
});
