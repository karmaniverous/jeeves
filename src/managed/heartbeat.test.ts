import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildHeartbeatSection,
  HEARTBEAT_HEADING,
  type HeartbeatEntry,
  parseHeartbeat,
  writeHeartbeatSection,
} from './heartbeat.js';

describe('parseHeartbeat', () => {
  it('returns empty result for file without heading', () => {
    const result = parseHeartbeat('# My Heartbeat\n\nSome user content.');
    expect(result.found).toBe(false);
    expect(result.userContent).toBe('# My Heartbeat\n\nSome user content.');
    expect(result.entries).toHaveLength(0);
  });

  it('parses section with alerts', () => {
    const content = [
      '# Jeeves Platform Status',
      '## jeeves-runner',
      '- Not installed. The runner is the job execution engine.',
      '## jeeves-watcher',
      '- Plugin installed but Qdrant missing.',
    ].join('\n');
    const result = parseHeartbeat(content);
    expect(result.found).toBe(true);
    expect(result.userContent).toBe('');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe('jeeves-runner');
    expect(result.entries[0].declined).toBe(false);
    expect(result.entries[0].content).toContain('Not installed');
    expect(result.entries[1].name).toBe('jeeves-watcher');
  });

  it('parses declined headings', () => {
    const content = [
      '# Jeeves Platform Status',
      '## jeeves-runner: declined',
      '## jeeves-watcher',
      '- Alert content here.',
    ].join('\n');
    const result = parseHeartbeat(content);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].name).toBe('jeeves-runner');
    expect(result.entries[0].declined).toBe(true);
    expect(result.entries[0].content).toBe('');
    expect(result.entries[1].declined).toBe(false);
  });

  it('preserves user content above heading', () => {
    const content = [
      '# My Tasks',
      '',
      '- [ ] Something to do',
      '',
      '# Jeeves Platform Status',
      '## jeeves-runner: declined',
    ].join('\n');
    const result = parseHeartbeat(content);
    expect(result.userContent).toContain('# My Tasks');
    expect(result.userContent).toContain('Something to do');
    expect(result.entries).toHaveLength(1);
  });

  it('handles headings-only section (effectively empty)', () => {
    const content = [
      '# Jeeves Platform Status',
      '## jeeves-runner: declined',
      '## jeeves-watcher: declined',
    ].join('\n');
    const result = parseHeartbeat(content);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.declined)).toBe(true);
    expect(result.entries.every((e) => e.content === '')).toBe(true);
  });
});

describe('buildHeartbeatSection', () => {
  it('builds section with alerts', () => {
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: false, content: '- Not installed.' },
      { name: 'jeeves-watcher', declined: true, content: '' },
    ];
    const result = buildHeartbeatSection(entries);
    expect(result).toContain(HEARTBEAT_HEADING);
    expect(result).toContain('## jeeves-runner');
    expect(result).toContain('- Not installed.');
    expect(result).toContain('## jeeves-watcher: declined');
  });

  it('omits healthy components (no content, not declined)', () => {
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: false, content: '' },
      { name: 'jeeves-watcher', declined: true, content: '' },
    ];
    const result = buildHeartbeatSection(entries);
    expect(result).not.toContain('## jeeves-runner');
    expect(result).toContain('## jeeves-watcher: declined');
  });

  it('headings-only when all declined', () => {
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: true, content: '' },
      { name: 'jeeves-meta', declined: true, content: '' },
    ];
    const result = buildHeartbeatSection(entries);
    expect(result).toBe(
      '# Jeeves Platform Status\n## jeeves-runner: declined\n## jeeves-meta: declined',
    );
  });
});

describe('writeHeartbeatSection', () => {
  let testDir: string;
  let filePath: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `jeeves-hb-test-${Date.now().toString()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(testDir, { recursive: true });
    filePath = join(testDir, 'HEARTBEAT.md');
  });

  afterEach(() => {
    // Cleanup handled by OS temp dir
  });

  it('creates file with section', async () => {
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: false, content: '- Not installed.' },
    ];
    await writeHeartbeatSection(filePath, entries);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain(HEARTBEAT_HEADING);
    expect(content).toContain('## jeeves-runner');
    expect(content).toContain('- Not installed.');
  });

  it('preserves user content above section', async () => {
    writeFileSync(
      filePath,
      '# My Tasks\n\n- [ ] Do something\n\n# Jeeves Platform Status\n## jeeves-runner\n- Old alert.\n',
    );
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: true, content: '' },
    ];
    await writeHeartbeatSection(filePath, entries);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# My Tasks');
    expect(content).toContain('Do something');
    expect(content).toContain('## jeeves-runner: declined');
    expect(content).not.toContain('Old alert');
  });

  it('preserves declined headings when regenerating', async () => {
    writeFileSync(
      filePath,
      '# Jeeves Platform Status\n## jeeves-runner: declined\n## jeeves-watcher\n- Some alert.\n',
    );
    // Simulate writer regeneration that keeps runner declined
    const entries: HeartbeatEntry[] = [
      { name: 'jeeves-runner', declined: true, content: '' },
      {
        name: 'jeeves-watcher',
        declined: false,
        content: '- Updated alert.',
      },
    ];
    await writeHeartbeatSection(filePath, entries);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('## jeeves-runner: declined');
    expect(content).toContain('- Updated alert.');
    expect(content).not.toContain('Some alert');
  });
});
