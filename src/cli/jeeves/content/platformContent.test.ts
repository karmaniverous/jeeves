import { describe, expect, it } from 'vitest';

import {
  BOOTSTRAP_FILE_MAX_CHARS,
  PLATFORM_CONTENT_TOTAL_BUDGET,
  PLATFORM_SECTION_BUDGETS,
} from './budgets.js';
import {
  PLATFORM_SECTIONS,
  PLATFORM_TEMPLATES,
  type PlatformSectionId,
} from './platformContent.js';
import { renderPlatformContent } from './renderPlatformContent.js';

const ids = Object.keys(PLATFORM_SECTIONS) as PlatformSectionId[];
// Realistic stamp: a long version string and a full ISO timestamp.
const rendered = renderPlatformContent({
  version: '10.10.10-rc.10',
  now: new Date('2026-09-25T08:39:31.418Z'),
});

describe('platform content budgets', () => {
  it('keeps each budget at or under half the per-file bootstrap limit', () => {
    for (const id of ids) {
      expect(PLATFORM_SECTION_BUDGETS[id]).toBeLessThanOrEqual(
        BOOTSTRAP_FILE_MAX_CHARS / 2,
      );
    }
  });

  it.each(ids)('rendered %s block fits its section budget', (id) => {
    expect(rendered.sections[id].block.length).toBeLessThanOrEqual(
      PLATFORM_SECTION_BUDGETS[id],
    );
  });

  it('rendered blocks fit the total budget', () => {
    const total = ids.reduce(
      (sum, id) => sum + rendered.sections[id].block.length,
      0,
    );
    expect(total).toBeLessThanOrEqual(PLATFORM_CONTENT_TOTAL_BUDGET);
  });
});

describe('platform content hygiene', () => {
  it.each(ids)('%s section has no retired live-content references', (id) => {
    const body = PLATFORM_SECTIONS[id].body;
    expect(body).not.toMatch(/HEARTBEAT\.md|TOOLS\.md|CLEANUP NEEDED/);
    expect(body).not.toMatch(/-openclaw install/);
  });

  it('ships the reference templates', () => {
    expect(Object.keys(PLATFORM_TEMPLATES).sort()).toEqual([
      'spec-to-code-guide.md',
      'spec.md',
    ]);
  });
});
