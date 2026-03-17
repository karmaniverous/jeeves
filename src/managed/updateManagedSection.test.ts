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

import { SOUL_MARKERS } from '../constants';
import { parseManaged } from './parseManaged';
import { updateManagedSection } from './updateManagedSection';

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
    expect(content).toContain('BEGIN JEEVES PLATFORM TOOLS');
    expect(content).toContain('END JEEVES PLATFORM TOOLS');
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
        '<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.1.0 | 2026-03-17T00:00:00Z -->',
        '',
        'Old managed content.',
        '',
        '<!-- END JEEVES PLATFORM TOOLS -->',
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
    expect(content).toContain('BEGIN JEEVES PLATFORM TOOLS');
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
          '<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.1.0 | 2026-03-17T00:00:00Z -->',
          '',
          '## Watcher',
          '',
          'Old watcher content.',
          '',
          '<!-- END JEEVES PLATFORM TOOLS -->',
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

    it('should throw if sectionId is missing in section mode', async () => {
      await expect(
        updateManagedSection(testFile, 'content', { mode: 'section' }),
      ).rejects.toThrow('sectionId is required');
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
          '<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.1.0 | 2026-03-17T00:00:00Z -->',
          '',
          'Old content.',
          '',
          '<!-- END JEEVES PLATFORM TOOLS -->',
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
          `<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.3.0 | ${freshStamp} -->`,
          '',
          'Newer content.',
          '',
          '<!-- END JEEVES PLATFORM TOOLS -->',
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
      expect(content).toContain('BEGIN JEEVES SOUL');
      expect(content).toContain('END JEEVES SOUL');
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
          '<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.1.0 | 2026-03-17T00:00:00Z -->',
          '',
          'Old managed content.',
          '',
          '<!-- END JEEVES PLATFORM TOOLS -->',
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
    });

    it('should not inject cleanup flag for unrelated user content', async () => {
      writeFileSync(
        testFile,
        [
          '<!-- BEGIN JEEVES PLATFORM TOOLS | core:0.1.0 | 2026-03-17T00:00:00Z -->',
          '',
          'Managed content about tools.',
          '',
          '<!-- END JEEVES PLATFORM TOOLS -->',
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
});
