import { describe, expect, it } from 'vitest';

import {
  AGENTS_MARKERS,
  LEGACY_TOOLS_MARKERS,
  SOUL_MARKERS,
} from '../constants/index.js';
import { escapeForRegex, parseManaged } from './parseManaged.js';

describe('parseManaged', () => {
  it('handles a fresh file (no markers)', () => {
    const result = parseManaged(
      '# My Notes\n\nSome user content.',
      SOUL_MARKERS,
    );
    expect(result.found).toBe(false);
    expect(result.versionStamp).toBeUndefined();
    expect(result.userContent).toBe('# My Notes\n\nSome user content.');
  });

  it('handles an empty file', () => {
    const result = parseManaged('', SOUL_MARKERS);
    expect(result.found).toBe(false);
    expect(result.userContent).toBe('');
  });

  it('parses a block with version stamp and surrounding content', () => {
    const content = [
      '# Title',
      '',
      `<!-- ${AGENTS_MARKERS.begin} | core:0.5.11 | 2026-09-25T08:39:31.418Z -->`,
      '',
      'Managed.',
      '',
      `<!-- ${AGENTS_MARKERS.end} -->`,
      '',
      'User notes.',
    ].join('\n');

    const result = parseManaged(content, AGENTS_MARKERS);
    expect(result).toEqual({
      found: true,
      versionStamp: {
        version: '0.5.11',
        timestamp: '2026-09-25T08:39:31.418Z',
      },
      managedContent: 'Managed.',
      beforeContent: '# Title',
      userContent: 'User notes.',
    });
  });

  it('handles a block without version stamp', () => {
    const content = `<!-- ${SOUL_MARKERS.begin} -->\nX\n<!-- ${SOUL_MARKERS.end} -->`;
    const result = parseManaged(content, SOUL_MARKERS);
    expect(result.found).toBe(true);
    expect(result.versionStamp).toBeUndefined();
    expect(result.managedContent).toBe('X');
  });

  it('treats BEGIN without END as not found', () => {
    const content = `<!-- ${SOUL_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->\nX`;
    const result = parseManaged(content, SOUL_MARKERS);
    expect(result.found).toBe(false);
    expect(result.userContent).toBe(content);
  });

  it('does not match a different marker set', () => {
    const content = `<!-- ${SOUL_MARKERS.begin} -->\nX\n<!-- ${SOUL_MARKERS.end} -->`;
    expect(parseManaged(content, LEGACY_TOOLS_MARKERS).found).toBe(false);
  });
});

describe('escapeForRegex', () => {
  it('escapes regex metacharacters', () => {
    const raw = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    expect(new RegExp(`^${escapeForRegex(raw)}$`).test(raw)).toBe(true);
  });
});
