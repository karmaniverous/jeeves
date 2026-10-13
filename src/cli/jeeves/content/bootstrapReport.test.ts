/**
 * Tests for the bootstrap-file size report (#120).
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGENTS_MARKERS } from '../../../constants/index.js';
import { useTempDir } from '../../../test/tempDir.js';
import { failed, fakeRunner, ok } from '../plugins/fakePorts.js';
import {
  BOOTSTRAP_TOTAL_MAX_CHARS,
  bootstrapReportLines,
  hasBootstrapProblems,
  levelOf,
  measureBootstrapFiles,
  readBootstrapLimits,
  USER_FILE_MAX_CHARS,
} from './bootstrapReport.js';
import { BOOTSTRAP_FILE_MAX_CHARS } from './budgets.js';

const limits = { perFile: 1_000, total: 3_000, defaulted: false };

describe('levelOf', () => {
  it('is ok below 90%, warn from 90% up to the limit, over past it', () => {
    expect(levelOf(899, 1_000)).toBe('ok');
    expect(levelOf(900, 1_000)).toBe('warn');
    expect(levelOf(1_000, 1_000)).toBe('warn');
    expect(levelOf(1_001, 1_000)).toBe('over');
  });
});

describe('measureBootstrapFiles', () => {
  const tempDir = useTempDir('jeeves-bootstrap-');

  it('splits AGENTS.md into the managed and the owner zone', () => {
    const ws = tempDir();
    const block = [
      `<!-- ${AGENTS_MARKERS.begin} | core:0.7.0 | 2026-10-13T00:00:00Z -->`,
      'managed',
      `<!-- ${AGENTS_MARKERS.end} -->`,
    ].join('\n');
    writeFileSync(join(ws, 'AGENTS.md'), `Mine.\n\n${block}\n`);

    const report = measureBootstrapFiles(ws, limits);
    expect(report.files).toHaveLength(1);
    const [agents] = report.files;

    expect(agents.name).toBe('AGENTS.md');
    expect(agents.managedChars).toBe(block.length);
    expect(agents.userChars).toBe(agents.chars - block.length);
    expect(agents.level).toBe('ok');
  });

  it('skips absent files, caps USER.md and flags warnings and overruns', () => {
    const ws = tempDir();
    writeFileSync(join(ws, 'SOUL.md'), 'x'.repeat(950));
    writeFileSync(join(ws, 'MEMORY.md'), 'x'.repeat(1_200));
    writeFileSync(join(ws, 'USER.md'), 'x'.repeat(10));

    const report = measureBootstrapFiles(ws, {
      ...limits,
      perFile: 20_000,
    });
    expect(report.files.map((f) => f.name)).toEqual([
      'SOUL.md',
      'USER.md',
      'MEMORY.md',
    ]);
    expect(report.files[1]?.limit).toBe(USER_FILE_MAX_CHARS);

    const tight = measureBootstrapFiles(ws, limits);
    expect(tight.files.map((f) => f.level)).toEqual(['warn', 'ok', 'over']);
    expect(hasBootstrapProblems(tight)).toBe(true);
    expect(bootstrapReportLines(tight).join('\n')).toMatch(
      /MEMORY\.md: 1200 \/ 1000 .*OVER LIMIT/,
    );
  });

  it('reports a clean workspace as no problem', () => {
    const ws = tempDir();
    writeFileSync(join(ws, 'AGENTS.md'), 'short');
    expect(hasBootstrapProblems(measureBootstrapFiles(ws, limits))).toBe(false);
  });
});

describe('readBootstrapLimits', () => {
  it('reads both limits from OpenClaw config', async () => {
    const fake = fakeRunner({
      'openclaw config get agents.defaults.bootstrapMaxChars': ok('15000'),
      'openclaw config get agents.defaults.bootstrapTotalMaxChars': ok('50000'),
    });
    await expect(readBootstrapLimits(fake.runner)).resolves.toEqual({
      perFile: 15_000,
      total: 50_000,
      defaulted: false,
    });
  });

  it('falls back to the defaults and says so', async () => {
    const fake = fakeRunner({ 'openclaw config get': failed() });
    const result = await readBootstrapLimits(fake.runner);
    expect(result).toEqual({
      perFile: BOOTSTRAP_FILE_MAX_CHARS,
      total: BOOTSTRAP_TOTAL_MAX_CHARS,
      defaulted: true,
    });
    expect(
      bootstrapReportLines({
        files: [],
        totalChars: 0,
        totalLevel: 'ok',
        limits: result,
      }).at(-1),
    ).toMatch(/using the defaults/);
  });
});
