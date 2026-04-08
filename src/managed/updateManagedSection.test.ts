import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SOUL_MARKERS, TOOLS_MARKERS } from '../constants';
import { parseManaged } from './parseManaged';
import { updateManagedSection } from './updateManagedSection';

/** Helper to build a BEGIN marker line with version stamp. */
function begin(
  markers: { begin: string },
  version: string,
  timestamp = '2026-03-17T00:00:00Z',
): string {
  return `<!-- ${markers.begin} | core:${version} | ${timestamp} -->`;
}

/** Helper to build an END marker line. */
function end(markers: { end: string }): string {
  return `<!-- ${markers.end} -->`;
}

describe('updateManagedSection', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'TOOLS.md');
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should create managed block in fresh file', async () => {
    await updateManagedSection(testFile, '## Platform\n\nPlatform content.', {
      mode: 'block',
      coreVersion: '0.1.0',
    });

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(TOOLS_MARKERS.begin);
    expect(content).toContain(TOOLS_MARKERS.end);
    expect(content).toContain('Platform content.');
  });

  it('should create file if it does not exist', async () => {
    const newFile = join(testDir, 'subdir', 'NEW.md');
    await updateManagedSection(newFile, 'content', {
      mode: 'block',
      coreVersion: '0.1.0',
    });

    expect(existsSync(newFile)).toBe(true);
  });

  it('should preserve user content below markers', async () => {
    writeFileSync(
      testFile,
      [
        begin(TOOLS_MARKERS, '0.1.0'),
        '',
        'Old managed content.',
        '',
        end(TOOLS_MARKERS),
        '',
        '# My Notes',
        '',
        'User content that must not be touched.',
      ].join('\n'),
    );

    await updateManagedSection(testFile, 'New managed content.', {
      mode: 'block',
      coreVersion: '0.1.0',
    });

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain('New managed content.');
    expect(content).toContain('User content that must not be touched.');
    expect(content).not.toContain('Old managed content.');
  });

  it('should push existing content to user zone on fresh file', async () => {
    writeFileSync(testFile, '# Existing Content\n\nSome stuff.');

    await updateManagedSection(testFile, 'Managed content.', {
      mode: 'block',
      coreVersion: '0.1.0',
    });

    const content = readFileSync(testFile, 'utf-8');
    expect(content).toContain(TOOLS_MARKERS.begin);
    expect(content).toContain('Managed content.');
    expect(content).toContain('# Existing Content');
  });

  describe('section mode', () => {
    it('should add a new section', async () => {
      writeFileSync(testFile, '');

      await updateManagedSection(testFile, 'Watcher content here.', {
        mode: 'section',
        sectionId: 'Watcher',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('## Watcher');
      expect(content).toContain('Watcher content here.');
    });

    it('should update an existing section', async () => {
      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          '## Watcher',
          '',
          'Old watcher content.',
          '',
          end(TOOLS_MARKERS),
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'New watcher content.', {
        mode: 'section',
        sectionId: 'Watcher',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('New watcher content.');
      expect(content).not.toContain('Old watcher content.');
    });

    it('should include H1 title when markers have a title', async () => {
      writeFileSync(testFile, '');

      await updateManagedSection(testFile, 'Platform content.', {
        mode: 'section',
        sectionId: 'Platform',
        markers: TOOLS_MARKERS,
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('# Jeeves Platform Tools');
      expect(content).toContain('## Platform');
    });

    it('should maintain stable section order', async () => {
      writeFileSync(testFile, '');

      // Add Meta first
      await updateManagedSection(testFile, 'Meta content.', {
        mode: 'section',
        sectionId: 'Meta',
        coreVersion: '0.1.0',
      });

      // Add Platform second
      await updateManagedSection(testFile, 'Platform content.', {
        mode: 'section',
        sectionId: 'Platform',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      const platformIdx = content.indexOf('## Platform');
      const metaIdx = content.indexOf('## Meta');
      expect(platformIdx).toBeLessThan(metaIdx);
    });

    it('should throw if sectionId is missing in section mode', () => {
      expect(() =>
        updateManagedSection(testFile, 'content', { mode: 'section' }),
      ).toThrow('sectionId is required');
    });
  });

  describe('version-stamp convergence', () => {
    it('should include version stamp in BEGIN marker', async () => {
      writeFileSync(testFile, '');

      await updateManagedSection(testFile, 'content', {
        mode: 'block',
        coreVersion: '0.2.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('core:0.2.0');
    });

    it('should write when my version is newer', async () => {
      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          'Old content.',
          '',
          end(TOOLS_MARKERS),
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'New content.', {
        mode: 'block',
        coreVersion: '0.2.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('New content.');
      expect(content).toContain('core:0.2.0');
    });

    it('should skip when my version is older and stamp is fresh', async () => {
      const freshStamp = new Date().toISOString();
      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.3.0', freshStamp),
          '',
          'Newer content.',
          '',
          end(TOOLS_MARKERS),
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'My old content.', {
        mode: 'block',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('Newer content.');
      expect(content).not.toContain('My old content.');
    });
  });

  describe('block mode with custom markers', () => {
    it('should work with SOUL markers', async () => {
      const soulFile = join(testDir, 'SOUL.md');
      writeFileSync(soulFile, '');

      await updateManagedSection(soulFile, 'Soul content here.', {
        mode: 'block',
        markers: SOUL_MARKERS,
        coreVersion: '0.1.0',
      });

      const content = readFileSync(soulFile, 'utf-8');
      expect(content).toContain(SOUL_MARKERS.begin);
      expect(content).toContain(SOUL_MARKERS.end);
      expect(content).toContain('Soul content here.');
    });
  });

  describe('concurrent writes', () => {
    it('should handle concurrent writes without corruption', async () => {
      writeFileSync(testFile, '');

      // Simulate concurrent section writes
      await Promise.all([
        updateManagedSection(testFile, 'Watcher data.', {
          mode: 'section',
          sectionId: 'Watcher',
          coreVersion: '0.1.0',
        }),
        updateManagedSection(testFile, 'Runner data.', {
          mode: 'section',
          sectionId: 'Runner',
          coreVersion: '0.1.0',
        }),
      ]);

      const content = readFileSync(testFile, 'utf-8');
      const parsed = parseManaged(content);
      expect(parsed.found).toBe(true);
      // At least one write should have succeeded fully
      expect(parsed.sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('regression coverage', () => {
    it('preserves mixed user content above and below an existing managed block', async () => {
      writeFileSync(
        testFile,
        [
          '# Above',
          '',
          'Keep this above.',
          '',
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          'Old managed content.',
          '',
          end(TOOLS_MARKERS),
          '',
          '# Below',
          '',
          'Keep this below.',
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'New managed content.', {
        mode: 'block',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      const aboveIdx = content.indexOf('# Above');
      const managedIdx = content.indexOf(TOOLS_MARKERS.begin);
      const belowIdx = content.indexOf('# Below');

      expect(content).toContain('Keep this above.');
      expect(content).toContain('Keep this below.');
      expect(content).toContain('New managed content.');
      expect(aboveIdx).toBeLessThan(managedIdx);
      expect(managedIdx).toBeLessThan(belowIdx);
    });

    it('strips orphaned BEGIN marker when inserting a new managed block', async () => {
      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          'Broken managed content with no END marker.',
          '',
          '# User Notes',
          '',
          'Preserve me.',
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'Recovered managed content.', {
        mode: 'block',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('Recovered managed content.');
      expect(content).toContain('Preserve me.');
      // The orphaned BEGIN marker must be stripped to prevent the parser
      // from pairing it with the new END marker on the next cycle.
      expect(content.match(/BEGIN JEEVES PLATFORM TOOLS/g)?.length).toBe(1);
      expect(content.match(/END JEEVES PLATFORM TOOLS/g)?.length).toBe(1);
    });
  });

  describe('cleanup detection', () => {
    it('should inject cleanup flag when orphaned content detected', async () => {
      const managed = [
        'Jeeves Platform Tools provides service health monitoring.',
        'The watcher indexes files into Qdrant for semantic search.',
        'The runner executes scheduled jobs from SQLite state.',
        'The server presents web UI with file browser and export.',
      ].join('\n');

      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          'Old managed content.',
          '',
          end(TOOLS_MARKERS),
          '',
          managed,
        ].join('\n'),
      );

      await updateManagedSection(testFile, managed, {
        mode: 'block',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).toContain('CLEANUP NEEDED');
      expect(content).toContain('outside this managed block');
      expect(content).not.toContain('below this managed section');
      expect(content).not.toContain('after the END marker');
    });

    it('should not inject cleanup flag for unrelated user content', async () => {
      writeFileSync(
        testFile,
        [
          begin(TOOLS_MARKERS, '0.1.0'),
          '',
          'Managed content about tools.',
          '',
          end(TOOLS_MARKERS),
          '',
          '# My Grocery List',
          '',
          'Milk, eggs, bread.',
        ].join('\n'),
      );

      await updateManagedSection(testFile, 'Managed content about tools.', {
        mode: 'block',
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      expect(content).not.toContain('CLEANUP NEEDED');
    });
  });

  describe('position', () => {
    it('position bottom: user content before managed block', async () => {
      writeFileSync(testFile, '# User Content\n\nMy notes.\n');

      await updateManagedSection(testFile, 'Managed body.', {
        mode: 'block',
        markers: SOUL_MARKERS, // position: 'bottom'
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      const managedIdx = content.indexOf(SOUL_MARKERS.begin);
      const userIdx = content.indexOf('# User Content');
      expect(userIdx).toBeLessThan(managedIdx);
      expect(content).toContain('My notes.');
      expect(content).toContain('Managed body.');
    });

    it('existing block stays in place regardless of configured position (Decision 39)', async () => {
      // Block is at the top (old format), but markers say position: 'bottom'.
      // Decision 39: once a block exists, its position is fixed. Don't move it.
      const oldContent = [
        begin(SOUL_MARKERS, '0.0.9'),
        '',
        '# Jeeves Platform Soul',
        '',
        'Old managed content.',
        '',
        end(SOUL_MARKERS),
        '',
        '# My Soul',
        '',
        'User personality.',
      ].join('\n');
      writeFileSync(testFile, oldContent);

      await updateManagedSection(testFile, 'New managed content.', {
        mode: 'block',
        markers: SOUL_MARKERS, // position: 'bottom'
        coreVersion: '0.1.0',
      });

      const content = readFileSync(testFile, 'utf-8');
      const parsed = parseManaged(content, SOUL_MARKERS);

      // Managed block should still be at the top (in place)
      expect(parsed.managedContent).toContain('New managed content.');
      // User content should still be below
      expect(parsed.userContent).toContain('User personality.');

      // Verify ordering: managed block before user content
      const managedIdx = content.indexOf(SOUL_MARKERS.begin);
      const userIdx = content.indexOf('User personality.');
      expect(managedIdx).toBeLessThan(userIdx);
    });
  });
});
