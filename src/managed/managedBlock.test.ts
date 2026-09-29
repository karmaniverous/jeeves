import { describe, expect, it } from 'vitest';

import { type ManagedMarkers, SOUL_MARKERS } from '../constants/index.js';
import {
  formatBeginMarker,
  formatEndMarker,
  removeManagedBlock,
  renderManagedBlock,
  upsertManagedBlock,
} from './managedBlock.js';
import { parseManaged } from './parseManaged.js';

const now = new Date('2026-09-25T00:00:00.000Z');
const stamp = { version: '1.0.0', now };

describe('formatBeginMarker / formatEndMarker', () => {
  it('formats stamped BEGIN and plain END markers', () => {
    expect(formatBeginMarker('BEGIN X', '1.2.3', now)).toBe(
      '<!-- BEGIN X | core:1.2.3 | 2026-09-25T00:00:00.000Z -->',
    );
    expect(formatEndMarker('END X')).toBe('<!-- END X -->');
  });
});

describe('renderManagedBlock', () => {
  it('renders markers, title and body', () => {
    const block = renderManagedBlock(SOUL_MARKERS, '\n## A\n\nBody\n', stamp);
    expect(block).toBe(
      [
        `<!-- ${SOUL_MARKERS.begin} | core:1.0.0 | 2026-09-25T00:00:00.000Z -->`,
        '',
        '# Jeeves Platform Soul',
        '',
        '## A',
        '',
        'Body',
        '',
        `<!-- ${SOUL_MARKERS.end} -->`,
      ].join('\n'),
    );
  });

  it('omits the title when the marker set has none', () => {
    const markers: ManagedMarkers = { begin: 'BEGIN T', end: 'END T' };
    const block = renderManagedBlock(markers, 'Body', stamp);
    expect(block).not.toContain('# ');
    expect(parseManaged(block, markers).managedContent).toBe('Body');
  });
});

describe('upsertManagedBlock', () => {
  it('creates content for an empty file', () => {
    const out = upsertManagedBlock('', SOUL_MARKERS, 'Body', stamp);
    const parsed = parseManaged(out, SOUL_MARKERS);
    expect(parsed.found).toBe(true);
    expect(parsed.managedContent).toContain('Body');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('inserts at bottom after user content when position is bottom', () => {
    const out = upsertManagedBlock(
      '# Mine\n\nHello',
      SOUL_MARKERS,
      'Body',
      stamp,
    );
    const parsed = parseManaged(out, SOUL_MARKERS);
    expect(parsed.beforeContent).toBe('# Mine\n\nHello');
    expect(parsed.userContent).toBe('');
  });

  it('inserts at top when position is top (default)', () => {
    const markers: ManagedMarkers = { begin: 'BEGIN T', end: 'END T' };
    const out = upsertManagedBlock('Hello', markers, 'Body', stamp);
    const parsed = parseManaged(out, markers);
    expect(parsed.beforeContent).toBe('');
    expect(parsed.userContent).toBe('Hello');
  });

  it('replaces an existing (legacy-stamped) block in place', () => {
    const existing = [
      'Before',
      '',
      `<!-- ${SOUL_MARKERS.begin} | core:0.5.11 | 2026-01-01T00:00:00Z -->`,
      '',
      '> ⚠️ CLEANUP NEEDED: old flag',
      '',
      'Old body',
      '',
      `<!-- ${SOUL_MARKERS.end} -->`,
      '',
      'After',
    ].join('\n');
    const out = upsertManagedBlock(existing, SOUL_MARKERS, 'New body', stamp);
    const parsed = parseManaged(out, SOUL_MARKERS);
    expect(parsed.beforeContent).toBe('Before');
    expect(parsed.userContent).toBe('After');
    expect(parsed.managedContent).toContain('New body');
    expect(parsed.managedContent).not.toContain('Old body');
    expect(parsed.managedContent).not.toContain('CLEANUP');
    expect(parsed.versionStamp?.version).toBe('1.0.0');
  });

  it('is idempotent for identical inputs', () => {
    const once = upsertManagedBlock('User', SOUL_MARKERS, 'Body', stamp);
    const twice = upsertManagedBlock(once, SOUL_MARKERS, 'Body', stamp);
    expect(twice).toBe(once);
  });

  it('strips an orphaned BEGIN marker before inserting', () => {
    const orphan = `User\n<!-- ${SOUL_MARKERS.begin} | core:0.1.0 | 2026-01-01T00:00:00Z -->\nMore`;
    const out = upsertManagedBlock(orphan, SOUL_MARKERS, 'Body', stamp);
    const begins = out
      .split('\n')
      .filter((l) => l.includes(SOUL_MARKERS.begin));
    expect(begins).toHaveLength(1);
    expect(parseManaged(out, SOUL_MARKERS).beforeContent).toBe('User\n\nMore');
  });
});

describe('removeManagedBlock', () => {
  it('removes the block and keeps user content', () => {
    const withBlock = upsertManagedBlock('Mine', SOUL_MARKERS, 'Body', stamp);
    expect(removeManagedBlock(withBlock, SOUL_MARKERS)).toBe('Mine\n');
  });

  it('leaves an empty file when the block was the only content', () => {
    const blockOnly = upsertManagedBlock('', SOUL_MARKERS, 'Body', stamp);
    expect(removeManagedBlock(blockOnly, SOUL_MARKERS)).toBe('');
  });

  it('returns content unchanged when no block exists', () => {
    expect(removeManagedBlock('Mine', SOUL_MARKERS)).toBe('Mine');
  });
});
