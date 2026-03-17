import { describe, expect, it } from 'vitest';

import { SECTION_IDS, SECTION_ORDER } from './sections';

describe('section constants', () => {
  it('should define all section IDs', () => {
    expect(SECTION_IDS.Platform).toBe('Platform');
    expect(SECTION_IDS.Watcher).toBe('Watcher');
    expect(SECTION_IDS.Server).toBe('Server');
    expect(SECTION_IDS.Runner).toBe('Runner');
    expect(SECTION_IDS.Meta).toBe('Meta');
  });

  it('should have stable ordering', () => {
    expect(SECTION_ORDER).toEqual([
      'Platform',
      'Watcher',
      'Server',
      'Runner',
      'Meta',
    ]);
  });
});
