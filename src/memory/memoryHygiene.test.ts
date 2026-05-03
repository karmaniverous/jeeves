import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { analyzeMemory } from './memoryHygiene.js';

describe('analyzeMemory', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-mem-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const defaults = {
    budget: 1000,
    warningThreshold: 0.8,
  };

  it('reports not found when MEMORY.md is missing', () => {
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.exists).toBe(false);
    expect(result.charCount).toBe(0);
  });

  it('reports character count and usage', () => {
    writeFileSync(join(testDir, 'MEMORY.md'), 'x'.repeat(600));
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.exists).toBe(true);
    expect(result.charCount).toBe(600);
    expect(result.usage).toBeCloseTo(0.6);
    expect(result.warning).toBe(false);
    expect(result.overBudget).toBe(false);
  });

  it('sets warning when usage exceeds threshold', () => {
    writeFileSync(join(testDir, 'MEMORY.md'), 'x'.repeat(850));
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.warning).toBe(true);
    expect(result.overBudget).toBe(false);
  });

  it('sets overBudget when usage exceeds 100%', () => {
    writeFileSync(join(testDir, 'MEMORY.md'), 'x'.repeat(1200));
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.overBudget).toBe(true);
  });

  it('does not include staleness fields in result', () => {
    writeFileSync(join(testDir, 'MEMORY.md'), '## Section\n- Some text');
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result).not.toHaveProperty('staleCandidates');
    expect(result).not.toHaveProperty('staleSectionNames');
  });
});
