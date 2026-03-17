import { describe, expect, it } from 'vitest';

import { SOUL_MARKERS, TOOLS_MARKERS } from '../constants';
import { parseManaged } from './parseManaged';

describe('parseManaged', () => {
  it('should handle fresh file (no markers)', () => {
    const result = parseManaged('# My Notes\n\nSome user content.');
    expect(result.found).toBe(false);
    expect(result.versionStamp).toBeUndefined();
    expect(result.sections).toEqual([]);
    expect(result.userContent).toBe('# My Notes\n\nSome user content.');
  });

  it('should handle empty file', () => {
    const result = parseManaged('');
    expect(result.found).toBe(false);
    expect(result.userContent).toBe('');
  });

  it('should parse valid managed block with version stamp', () => {
    const content = [
      `<!-- ${TOOLS_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      '',
      '## Platform',
      '',
      'Platform content here.',
      '',
      '## Watcher',
      '',
      'Watcher content here.',
      '',
      `<!-- ${TOOLS_MARKERS.end} -->`,
      '',
      '# User Notes',
      '',
      'My custom content.',
    ].join('\n');

    const result = parseManaged(content);
    expect(result.found).toBe(true);
    expect(result.versionStamp).toEqual({
      version: '0.1.0',
      timestamp: '2026-03-17T00:00:00Z',
    });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]).toMatchObject({
      id: 'Platform',
      content: 'Platform content here.',
    });
    expect(result.sections[1]).toMatchObject({
      id: 'Watcher',
      content: 'Watcher content here.',
    });
    expect(result.userContent).toContain('My custom content.');
  });

  it('should handle managed block without version stamp', () => {
    const content = [
      `<!-- ${TOOLS_MARKERS.begin} -->`,
      '',
      '## Platform',
      '',
      'Content.',
      '',
      `<!-- ${TOOLS_MARKERS.end} -->`,
    ].join('\n');

    const result = parseManaged(content);
    expect(result.found).toBe(true);
    expect(result.versionStamp).toBeUndefined();
    expect(result.sections).toHaveLength(1);
  });

  it('should handle corrupt markers (BEGIN without END)', () => {
    const content = [
      `<!-- ${TOOLS_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      '## Platform',
      'Content.',
    ].join('\n');

    const result = parseManaged(content);
    expect(result.found).toBe(false);
    expect(result.userContent).toContain(TOOLS_MARKERS.begin);
  });

  it('should sort sections by stable order', () => {
    const content = [
      `<!-- ${TOOLS_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      '',
      '## Meta',
      '',
      'Meta content.',
      '',
      '## Platform',
      '',
      'Platform content.',
      '',
      '## Watcher',
      '',
      'Watcher content.',
      '',
      `<!-- ${TOOLS_MARKERS.end} -->`,
    ].join('\n');

    const result = parseManaged(content);
    expect(result.sections[0]).toMatchObject({ id: 'Platform' });
    expect(result.sections[1]).toMatchObject({ id: 'Watcher' });
    expect(result.sections[2]).toMatchObject({ id: 'Meta' });
  });

  it('should preserve content before markers', () => {
    const content = [
      '# Title',
      '',
      `<!-- ${TOOLS_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      '',
      '## Platform',
      '',
      'Content.',
      '',
      `<!-- ${TOOLS_MARKERS.end} -->`,
    ].join('\n');

    const result = parseManaged(content);
    expect(result.beforeContent).toBe('# Title');
  });

  it('should work with custom markers', () => {
    const content = [
      `<!-- ${SOUL_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      '',
      'Soul content here.',
      '',
      `<!-- ${SOUL_MARKERS.end} -->`,
      '',
      'User soul content.',
    ].join('\n');

    const result = parseManaged(content, SOUL_MARKERS);
    expect(result.found).toBe(true);
    expect(result.managedContent).toBe('Soul content here.');
    expect(result.userContent).toBe('User soul content.');
  });

  it('should not match wrong markers', () => {
    const content = [
      `<!-- ${SOUL_MARKERS.begin} | core:0.1.0 | 2026-03-17T00:00:00Z -->`,
      'Soul content.',
      `<!-- ${SOUL_MARKERS.end} -->`,
    ].join('\n');

    const result = parseManaged(content, TOOLS_MARKERS);
    expect(result.found).toBe(false);
  });
});
