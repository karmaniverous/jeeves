/**
 * `runOpenClawPatches` when no OpenClaw install can be found: a failed
 * report instead of a throw, so install/update finish and exit non-zero.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('./resolveOpenclawDist.js', () => ({
  resolveOpenClawDist: () => {
    throw new Error('OpenClaw dist directory not found.');
  },
}));

import { runOpenClawPatches } from './patchOpenclawCommand.js';

describe('runOpenClawPatches without an OpenClaw install', () => {
  it('reports a failure instead of throwing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const report = runOpenClawPatches({ dryRun: false });
    expect(report.failed).toBe(true);
    expect(report.changed).toBe(false);
    expect(report.results[0]?.message).toContain('not found');
    log.mockRestore();
  });
});
