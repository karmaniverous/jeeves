import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { analyzeMemory, extractMostRecentDate } from './memoryHygiene.js';

describe('extractMostRecentDate', () => {
  it('extracts a single date', () => {
    const d = extractMostRecentDate('Updated on 2026-03-15');
    expect(d?.toISOString()).toContain('2026-03-15');
  });

  it('returns the most recent of multiple dates', () => {
    const d = extractMostRecentDate(
      '## 2026-01-10\nSome text\n## 2026-03-20\nNewer text',
    );
    expect(d?.toISOString()).toContain('2026-03-20');
  });

  it('returns undefined when no dates found', () => {
    expect(extractMostRecentDate('No dates here.')).toBeUndefined();
  });

  it('ignores invalid date strings', () => {
    expect(extractMostRecentDate('9999-99-99')).toBeUndefined();
  });
});

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
    staleDays: 30,
  };

  it('reports not found when MEMORY.md is missing', () => {
    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.exists).toBe(false);
    expect(result.charCount).toBe(0);
    expect(result.staleCandidates).toBe(0);
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

  it('detects stale sections by date', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const content = [
      '# MEMORY.md',
      '',
      `## Old Section`,
      `- Entry from ${oldDate}`,
      '',
      '## Evergreen Section',
      '- No dates here, always relevant.',
    ].join('\n');
    writeFileSync(join(testDir, 'MEMORY.md'), content);

    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.staleCandidates).toBe(1);
    expect(result.staleSectionNames).toContain('Old Section');
  });

  it('does not flag evergreen sections without dates', () => {
    const content = [
      '# MEMORY.md',
      '',
      '## Design Principles',
      '- Always be correct.',
    ].join('\n');
    writeFileSync(join(testDir, 'MEMORY.md'), content);

    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.staleCandidates).toBe(0);
  });

  it('does not flag sections with recent dates', () => {
    const recent = new Date().toISOString().slice(0, 10);
    const content = [
      '# MEMORY.md',
      '',
      '## Recent Work',
      `- Updated ${recent}`,
    ].join('\n');
    writeFileSync(join(testDir, 'MEMORY.md'), content);

    const result = analyzeMemory({ workspacePath: testDir, ...defaults });
    expect(result.staleCandidates).toBe(0);
  });
});
