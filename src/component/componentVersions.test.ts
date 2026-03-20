import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPONENT_VERSIONS_FILE } from '../constants/paths.js';
import {
  type ComponentVersionsState,
  readComponentVersions,
  writeComponentVersion,
} from './componentVersions.js';

const TEST_DIR = join(tmpdir(), 'jeeves-comp-versions-test');

describe('componentVersions', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('readComponentVersions', () => {
    it('returns empty object when file does not exist', () => {
      expect(readComponentVersions(TEST_DIR)).toEqual({});
    });

    it('reads existing state file', () => {
      const state: ComponentVersionsState = {
        watcher: {
          serviceVersion: '1.0.0',
          pluginVersion: '0.2.0',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      };
      const filePath = join(TEST_DIR, COMPONENT_VERSIONS_FILE);
      writeFileSync(filePath, JSON.stringify(state));

      const result = readComponentVersions(TEST_DIR);
      expect(result.watcher).toBeDefined();
      expect(result.watcher.serviceVersion).toBe('1.0.0');
    });

    it('returns empty object on corrupt JSON', () => {
      const filePath = join(TEST_DIR, COMPONENT_VERSIONS_FILE);
      writeFileSync(filePath, 'not json');

      expect(readComponentVersions(TEST_DIR)).toEqual({});
    });
  });

  describe('writeComponentVersion', () => {
    it('creates file with component entry', () => {
      writeComponentVersion(TEST_DIR, {
        componentName: 'watcher',
        serviceVersion: '1.2.0',
        pluginVersion: '0.3.0',
        servicePackage: '@karmaniverous/jeeves-watcher',
        pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
      });

      const filePath = join(TEST_DIR, COMPONENT_VERSIONS_FILE);
      expect(existsSync(filePath)).toBe(true);

      const content = JSON.parse(
        readFileSync(filePath, 'utf-8'),
      ) as ComponentVersionsState;
      expect(content.watcher).toBeDefined();
      expect(content.watcher.serviceVersion).toBe('1.2.0');
      expect(content.watcher.pluginVersion).toBe('0.3.0');
      expect(content.watcher.updatedAt).toBeDefined();
    });

    it('merges with existing entries', () => {
      writeComponentVersion(TEST_DIR, {
        componentName: 'watcher',
        serviceVersion: '1.0.0',
      });

      writeComponentVersion(TEST_DIR, {
        componentName: 'runner',
        serviceVersion: '2.0.0',
      });

      const content = readComponentVersions(TEST_DIR);
      expect(content.watcher.serviceVersion).toBe('1.0.0');
      expect(content.runner.serviceVersion).toBe('2.0.0');
    });

    it('overwrites same component entry', () => {
      writeComponentVersion(TEST_DIR, {
        componentName: 'watcher',
        serviceVersion: '1.0.0',
      });

      writeComponentVersion(TEST_DIR, {
        componentName: 'watcher',
        serviceVersion: '1.1.0',
      });

      const content = readComponentVersions(TEST_DIR);
      expect(content.watcher.serviceVersion).toBe('1.1.0');
    });

    it('creates directory if needed', () => {
      const nestedDir = join(TEST_DIR, 'nested', 'config');
      writeComponentVersion(nestedDir, {
        componentName: 'meta',
        pluginVersion: '0.1.0',
      });

      const filePath = join(nestedDir, COMPONENT_VERSIONS_FILE);
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
