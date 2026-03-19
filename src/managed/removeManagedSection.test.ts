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

import { TOOLS_MARKERS } from '../constants/index.js';
import { removeManagedSection } from './removeManagedSection.js';
import { formatBeginMarker, formatEndMarker } from './versionStamp.js';

const TEST_DIR = join(tmpdir(), 'jeeves-remove-managed-test');

function buildManagedFile(
  sections: Array<{ id: string; content: string }>,
  options?: { before?: string; after?: string },
): string {
  const begin = formatBeginMarker(TOOLS_MARKERS.begin, '0.1.0');
  const end = formatEndMarker(TOOLS_MARKERS.end);
  const sectionText = sections
    .map((s) => `## ${s.id}\n\n${s.content}`)
    .join('\n\n');
  const body = `# ${TOOLS_MARKERS.title ?? ''}\n\n${sectionText}`;

  const parts: string[] = [];
  if (options?.before) {
    parts.push(options.before);
    parts.push('');
  }
  parts.push(begin);
  parts.push('');
  parts.push(body);
  parts.push('');
  parts.push(end);
  if (options?.after) {
    parts.push('');
    parts.push(options.after);
  }
  parts.push('');

  return parts.join('\n');
}

describe('removeManagedSection', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('removes entire managed block when no sectionId given', async () => {
    const filePath = join(TEST_DIR, 'test1.md');
    const content = buildManagedFile(
      [{ id: 'Platform', content: 'Platform stuff' }],
      { before: '# My Header', after: '# User Content\n\nKeep this.' },
    );
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, { markers: TOOLS_MARKERS });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).not.toContain('BEGIN JEEVES');
    expect(result).not.toContain('END JEEVES');
    expect(result).not.toContain('Platform stuff');
    expect(result).toContain('# My Header');
    expect(result).toContain('Keep this.');
  });

  it('removes a specific section by sectionId', async () => {
    const filePath = join(TEST_DIR, 'test2.md');
    const content = buildManagedFile([
      { id: 'Platform', content: 'Platform stuff' },
      { id: 'Watcher', content: 'Watcher stuff' },
    ]);
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, {
      sectionId: 'Watcher',
      markers: TOOLS_MARKERS,
    });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).toContain('Platform stuff');
    expect(result).not.toContain('Watcher stuff');
    expect(result).toContain('BEGIN JEEVES');
    expect(result).toContain('END JEEVES');
  });

  it('removes entire block when last section is removed', async () => {
    const filePath = join(TEST_DIR, 'test3.md');
    const content = buildManagedFile([
      { id: 'Watcher', content: 'Watcher stuff' },
    ]);
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, {
      sectionId: 'Watcher',
      markers: TOOLS_MARKERS,
    });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).not.toContain('BEGIN JEEVES');
    expect(result).not.toContain('Watcher stuff');
  });

  it('is a no-op when file does not exist', async () => {
    const filePath = join(TEST_DIR, 'nonexistent.md');
    await removeManagedSection(filePath, { markers: TOOLS_MARKERS });
    expect(existsSync(filePath)).toBe(false);
  });

  it('is a no-op when markers are not found', async () => {
    const filePath = join(TEST_DIR, 'no-markers.md');
    const content = '# Just a regular file\n\nNo managed content here.\n';
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, { markers: TOOLS_MARKERS });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).toBe(content);
  });

  it('is a no-op when sectionId does not exist', async () => {
    const filePath = join(TEST_DIR, 'test5.md');
    const content = buildManagedFile([
      { id: 'Platform', content: 'Platform stuff' },
    ]);
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, {
      sectionId: 'NonExistent',
      markers: TOOLS_MARKERS,
    });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).toBe(content);
  });

  it('preserves user content after block removal', async () => {
    const filePath = join(TEST_DIR, 'test6.md');
    const userContent = '# My Custom Section\n\nUser-authored content.';
    const content = buildManagedFile(
      [{ id: 'Platform', content: 'Platform stuff' }],
      { after: userContent },
    );
    writeFileSync(filePath, content);

    await removeManagedSection(filePath, { markers: TOOLS_MARKERS });

    const result = readFileSync(filePath, 'utf-8');
    expect(result).toContain('User-authored content.');
    expect(result).not.toContain('Platform stuff');
  });
});
