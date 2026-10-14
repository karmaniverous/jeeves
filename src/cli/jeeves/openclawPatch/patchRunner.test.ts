import { describe, expect, it } from 'vitest';

import type { PatchOutcome } from './distPatchIo.js';
import {
  type DistPatch,
  formatPatchSummary,
  runAllPatches,
  summarizePatchRun,
} from './patchRunner.js';

describe('runAllPatches', () => {
  it('runs every patch even after a failure, and converts throws to error outcomes', () => {
    const seen: string[] = [];
    const patches: DistPatch[] = [
      {
        name: 'a',
        run: (): PatchOutcome => {
          seen.push('a');
          return { name: 'a', status: 'not-found', message: 'missing' };
        },
      },
      {
        name: 'b',
        run: (): PatchOutcome => {
          seen.push('b');
          throw new Error('boom');
        },
      },
      {
        name: 'c',
        run: (): PatchOutcome => {
          seen.push('c');
          return { name: 'c', status: 'patched', message: 'ok' };
        },
      },
    ];

    const results = runAllPatches(patches, '/dist', false);

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(results).toEqual([
      { name: 'a', status: 'not-found', message: 'missing' },
      { name: 'b', status: 'error', message: 'boom' },
      { name: 'c', status: 'patched', message: 'ok' },
    ]);
  });

  it('passes distDir and dryRun through to each patch', () => {
    const calls: Array<{ distDir: string; dryRun: boolean }> = [];
    const patches: DistPatch[] = [
      {
        name: 'a',
        run: (distDir, dryRun): PatchOutcome => {
          calls.push({ distDir, dryRun });
          return { name: 'a', status: 'patched', message: 'ok' };
        },
      },
    ];
    runAllPatches(patches, '/some/dist', true);
    expect(calls).toEqual([{ distDir: '/some/dist', dryRun: true }]);
  });
});

describe('summarizePatchRun', () => {
  it('reports changed when any patch patched', () => {
    const report = summarizePatchRun([
      { name: 'a', status: 'already-patched', message: 'ok' },
      { name: 'b', status: 'patched', message: 'ok' },
    ]);
    expect(report.changed).toBe(true);
    expect(report.failed).toBe(false);
  });

  it('reports failed when any patch is not-found or error', () => {
    expect(
      summarizePatchRun([{ name: 'a', status: 'not-found', message: 'x' }])
        .failed,
    ).toBe(true);
    expect(
      summarizePatchRun([{ name: 'a', status: 'error', message: 'x' }]).failed,
    ).toBe(true);
  });

  it('reports neither changed nor failed when every patch was already patched', () => {
    const report = summarizePatchRun([
      { name: 'a', status: 'already-patched', message: 'ok' },
      { name: 'b', status: 'upstream-fixed', message: 'ok' },
    ]);
    expect(report).toEqual({
      changed: false,
      failed: false,
      results: [
        { name: 'a', status: 'already-patched', message: 'ok' },
        { name: 'b', status: 'upstream-fixed', message: 'ok' },
      ],
    });
  });
});

describe('formatPatchSummary', () => {
  it('reports per-patch status and a failure count', () => {
    const results: PatchOutcome[] = [
      { name: 'a', status: 'patched', message: 'patched dist-A.mjs:1' },
      { name: 'b', status: 'not-found', message: 'anchor missing' },
      { name: 'c', status: 'error', message: 'ambiguous' },
    ];
    expect(formatPatchSummary(results)).toEqual([
      '  OK      a — patched dist-A.mjs:1',
      '  FAILED  b — anchor missing',
      '  FAILED  c — ambiguous',
      '  2 of 3 patches FAILED.',
    ]);
  });

  it('reports all succeeded', () => {
    expect(
      formatPatchSummary([
        { name: 'a', status: 'already-patched', message: 'ok' },
      ]).at(-1),
    ).toBe('  All 1 patches succeeded.');
  });
});
