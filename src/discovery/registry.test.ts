import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkRegistryVersion } from './registry';

describe('checkRegistryVersion', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-reg-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return cached version within TTL', () => {
    writeFileSync(
      join(testDir, 'registry-cache.json'),
      JSON.stringify({
        version: '1.2.3',
        checkedAt: new Date().toISOString(),
      }),
    );

    const result = checkRegistryVersion('some-package', testDir, 3600);
    expect(result).toBe('1.2.3');
  });

  it('should ignore expired cache', () => {
    writeFileSync(
      join(testDir, 'registry-cache.json'),
      JSON.stringify({
        version: '1.2.3',
        checkedAt: new Date(Date.now() - 7200 * 1000).toISOString(),
      }),
    );

    // This will try to query npm — for a non-existent package it returns undefined
    const result = checkRegistryVersion(
      '@karmaniverous/definitely-not-a-real-package-12345',
      testDir,
      3600,
    );
    expect(result).toBeUndefined();
  });

  it('should handle corrupt cache gracefully', () => {
    writeFileSync(join(testDir, 'registry-cache.json'), 'not json');

    // Will try npm query for a non-existent package
    const result = checkRegistryVersion(
      '@karmaniverous/definitely-not-a-real-package-12345',
      testDir,
      3600,
    );
    expect(result).toBeUndefined();
  });

  it(
    'should write cache after successful registry query',
    { timeout: 15_000 },
    () => {
      // Query a real package — commander is a dependency
      const result = checkRegistryVersion('commander', testDir, 3600);
      // npm is available in CI, so this should return a version
      expect(result).toBeTruthy();
      const cacheContent = readFileSync(
        join(testDir, 'registry-cache.json'),
        'utf-8',
      );
      const cache = JSON.parse(cacheContent) as {
        version: string;
        checkedAt: string;
      };
      expect(cache.version).toBe(result);
      expect(cache.checkedAt).toBeTruthy();
    },
  );
});
