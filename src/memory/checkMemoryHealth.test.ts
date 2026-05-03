/**
 * Tests for HEARTBEAT memory hygiene integration.
 *
 * @remarks
 * Verifies that `checkMemoryHealth()` produces correct HeartbeatEntry
 * values for budget warnings and healthy states.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKSPACE_CONFIG_DEFAULTS } from '../config/workspaceConfig.js';
import {
  checkMemoryHealth,
  MEMORY_HEARTBEAT_NAME,
} from './checkMemoryHealth.js';

describe('checkMemoryHealth', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-memhealth-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const defaults = {
    budget: WORKSPACE_CONFIG_DEFAULTS.memory.budget,
    warningThreshold: WORKSPACE_CONFIG_DEFAULTS.memory.warningThreshold,
  };

  it('returns undefined when MEMORY.md does not exist', () => {
    const result = checkMemoryHealth({ workspacePath: testDir, ...defaults });
    expect(result).toBeUndefined();
  });

  it('returns undefined when memory is healthy', () => {
    writeFileSync(
      join(testDir, 'MEMORY.md'),
      '## Current Notes\n\nSmall file.',
    );
    const result = checkMemoryHealth({ workspacePath: testDir, ...defaults });
    expect(result).toBeUndefined();
  });

  it('returns an entry when budget warning threshold is exceeded', () => {
    const content = 'x'.repeat(17_000);
    writeFileSync(join(testDir, 'MEMORY.md'), `## Notes\n\n${content}`);
    const result = checkMemoryHealth({
      workspacePath: testDir,
      budget: 20_000,
      warningThreshold: 0.8,
    });
    expect(result).toBeDefined();
    expect(result?.name).toBe(MEMORY_HEARTBEAT_NAME);
    expect(result?.declined).toBe(false);
    expect(result?.content).toContain('Budget:');
    expect(result?.content).toContain('Consider reviewing.');
  });

  it('flags over-budget with bold warning', () => {
    const content = 'x'.repeat(21_000);
    writeFileSync(join(testDir, 'MEMORY.md'), `## Notes\n\n${content}`);
    const result = checkMemoryHealth({
      workspacePath: testDir,
      budget: 20_000,
      warningThreshold: 0.8,
    });
    expect(result).toBeDefined();
    expect(result?.content).toContain('**Over budget.**');
  });

  it('does not flag sections based on dates', () => {
    const staleContent = [
      '## Old Section',
      '- 2024-01-15 did something',
      '',
      '## Fresh Section',
      `- ${new Date().toISOString().slice(0, 10)} did something recent`,
    ].join('\n');
    writeFileSync(join(testDir, 'MEMORY.md'), staleContent);
    const result = checkMemoryHealth({
      workspacePath: testDir,
      budget: 100_000,
      warningThreshold: 0.8,
    });
    // No alert because budget is fine and staleness is removed
    expect(result).toBeUndefined();
  });

  it('respects custom config values', () => {
    writeFileSync(join(testDir, 'MEMORY.md'), '## Notes\n\nSmall file.');
    const result = checkMemoryHealth({
      workspacePath: testDir,
      budget: 10,
      warningThreshold: 0.5,
    });
    expect(result).toBeDefined();
    expect(result?.content).toContain('**Over budget.**');
  });
});
