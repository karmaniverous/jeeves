import { describe, expect, it } from 'vitest';

import {
  allAppliedLive,
  emptyApplyReport,
  recordChange,
} from './applyReport.js';

describe('applyReport', () => {
  it('counts installs and config writes that OpenClaw applied live', () => {
    const report = emptyApplyReport();
    recordChange(
      report,
      'Updated 10 config paths. Change will apply without restarting the gateway.',
    );
    recordChange(
      report,
      'Installed plugin: x\nApplied in Gateway generation 4.',
    );
    recordChange(
      report,
      'Installed plugin: y\nApplied in Gateway generation 5.',
    );
    expect(report).toEqual({ changes: 3, live: 3, generations: [4, 5] });
    expect(allAppliedLive(report)).toBe(true);
  });

  it.each([
    ['output without a live-apply line', 'Installed plugin: x'],
    ['an unknown outcome', undefined],
  ])('needs a restart after %s', (_label, output) => {
    const report = emptyApplyReport();
    recordChange(report, 'Applied in Gateway generation 4.');
    recordChange(report, output);
    expect(report.live).toBe(1);
    expect(allAppliedLive(report)).toBe(false);
  });

  it('is not "all live" when nothing changed', () => {
    expect(allAppliedLive(emptyApplyReport())).toBe(false);
  });
});
