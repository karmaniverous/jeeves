/**
 * Tests for stripForeignMarkers — cross-contamination prevention.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
  AGENTS_MARKERS,
  SOUL_MARKERS,
  TOOLS_MARKERS,
} from '../constants/index.js';
import { stripForeignMarkers } from './stripForeignMarkers.js';

describe('stripForeignMarkers', () => {
  it('should return content unchanged when no foreign markers present', () => {
    const content = '## My Custom Section\n\nSome user content here.';
    const result = stripForeignMarkers(content, TOOLS_MARKERS);
    expect(result).toBe(content);
  });

  it('should strip SOUL markers from content owned by TOOLS', () => {
    const content = [
      '## Custom Section',
      '',
      'User stuff.',
      '',
      `<!-- ${SOUL_MARKERS.begin} | core:0.3.0 | 2026-03-25T00:00:00.000Z -->`,
      '',
      '# Jeeves Platform Soul',
      '',
      '## Core Truths',
      '',
      'Some soul content.',
      '',
      `<!-- ${SOUL_MARKERS.end} -->`,
      '',
      'More user stuff.',
    ].join('\n');

    const result = stripForeignMarkers(content, TOOLS_MARKERS);
    expect(result).not.toContain(SOUL_MARKERS.begin);
    expect(result).not.toContain('Core Truths');
    expect(result).toContain('Custom Section');
    expect(result).toContain('User stuff.');
    expect(result).toContain('More user stuff.');
  });

  it('should strip AGENTS markers from content owned by TOOLS', () => {
    const content = [
      'User content above.',
      '',
      `<!-- ${AGENTS_MARKERS.begin} | core:0.2.0 | 2026-03-25T00:00:00.000Z -->`,
      '',
      '# Jeeves Platform Agents',
      '',
      '## Memory Architecture',
      '',
      'Agent stuff.',
      '',
      `<!-- ${AGENTS_MARKERS.end} -->`,
    ].join('\n');

    const result = stripForeignMarkers(content, TOOLS_MARKERS);
    expect(result).not.toContain(AGENTS_MARKERS.begin);
    expect(result).not.toContain('Memory Architecture');
    expect(result).toContain('User content above.');
  });

  it('should strip multiple foreign marker sets at once', () => {
    const content = [
      `<!-- ${SOUL_MARKERS.begin} | core:0.3.0 | 2026-03-25T00:00:00.000Z -->`,
      '',
      'Soul content.',
      '',
      `<!-- ${SOUL_MARKERS.end} -->`,
      '',
      `<!-- ${AGENTS_MARKERS.begin} | core:0.3.0 | 2026-03-25T00:00:00.000Z -->`,
      '',
      'Agents content.',
      '',
      `<!-- ${AGENTS_MARKERS.end} -->`,
      '',
      'Actual user content.',
    ].join('\n');

    const result = stripForeignMarkers(content, TOOLS_MARKERS);
    expect(result).not.toContain('Soul content.');
    expect(result).not.toContain('Agents content.');
    expect(result).toBe('Actual user content.');
  });

  it('should NOT strip own markers', () => {
    const content = [
      `<!-- ${TOOLS_MARKERS.begin} | core:0.3.0 | 2026-03-25T00:00:00.000Z -->`,
      '',
      'Tools content.',
      '',
      `<!-- ${TOOLS_MARKERS.end} -->`,
    ].join('\n');

    const result = stripForeignMarkers(content, TOOLS_MARKERS);
    expect(result).toContain('Tools content.');
  });

  it('should handle empty content', () => {
    expect(stripForeignMarkers('', TOOLS_MARKERS)).toBe('');
  });

  it('should handle content with only whitespace', () => {
    expect(stripForeignMarkers('   \n\n   ', TOOLS_MARKERS)).toBe('');
  });
});
