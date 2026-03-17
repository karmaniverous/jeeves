import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { coreConfigSchema, generateJsonSchema, loadConfig } from './config';

describe('config', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-cfg-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('coreConfigSchema', () => {
    it('should parse valid config', () => {
      const result = coreConfigSchema.parse({
        owners: ['jason'],
        services: {
          watcher: { url: 'http://127.0.0.1:1936' },
        },
        registryCache: { ttlSeconds: 3600 },
      });
      expect(result.owners).toEqual(['jason']);
      expect(result.services['watcher'].url).toBe('http://127.0.0.1:1936');
    });

    it('should apply defaults for missing fields', () => {
      const result = coreConfigSchema.parse({});
      expect(result.owners).toEqual([]);
      expect(result.services).toEqual({});
      expect(result.registryCache.ttlSeconds).toBe(3600);
    });

    it('should reject invalid service URL', () => {
      expect(() =>
        coreConfigSchema.parse({
          services: { watcher: { url: 'not-a-url' } },
        }),
      ).toThrow();
    });
  });

  describe('generateJsonSchema', () => {
    it('should return a valid JSON Schema object', () => {
      const schema = generateJsonSchema();
      expect(schema['$schema']).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema['type']).toBe('object');
      expect(schema['properties']).toBeDefined();
    });
  });

  describe('loadConfig', () => {
    it('should return undefined for missing config', () => {
      expect(loadConfig(join(testDir, 'nonexistent'))).toBeUndefined();
    });

    it('should load valid config file', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          owners: ['jason'],
          services: { watcher: { url: 'http://localhost:1936' } },
        }),
      );
      const config = loadConfig(testDir);
      expect(config).toBeDefined();
      expect(config?.owners).toEqual(['jason']);
    });

    it('should return undefined for invalid JSON', () => {
      writeFileSync(join(testDir, 'config.json'), 'not json');
      expect(loadConfig(testDir)).toBeUndefined();
    });

    it('should return undefined for invalid schema', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ services: { watcher: { url: 123 } } }),
      );
      expect(loadConfig(testDir)).toBeUndefined();
    });
  });
});
