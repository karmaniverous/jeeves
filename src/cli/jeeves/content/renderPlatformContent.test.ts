import { describe, expect, it } from 'vitest';

import { AGENTS_MARKERS, SOUL_MARKERS } from '../../../constants/index.js';
import { parseManaged } from '../../../managed/parseManaged.js';
import {
  renderPlatformContent,
  upsertPlatformSection,
} from './renderPlatformContent.js';

const now = new Date('2026-09-25T00:00:00.000Z');

describe('renderPlatformContent', () => {
  it('renders stamped SOUL and AGENTS blocks', () => {
    const out = renderPlatformContent({ version: '1.0.0', now });
    expect(out.sections.soul.file).toBe('SOUL.md');
    expect(out.sections.agents.file).toBe('AGENTS.md');

    const soul = parseManaged(out.sections.soul.block, SOUL_MARKERS);
    expect(soul.found).toBe(true);
    expect(soul.versionStamp).toEqual({
      version: '1.0.0',
      timestamp: '2026-09-25T00:00:00.000Z',
    });
    expect(soul.managedContent).toContain('Core Truths');

    const agents = parseManaged(out.sections.agents.block, AGENTS_MARKERS);
    expect(agents.managedContent).toContain('Context Compaction Recovery');
  });

  it('renders skills and templates with relative paths', () => {
    const out = renderPlatformContent({ now });
    expect(out.skills.map((f) => f.path)).toContain('skills/jeeves/SKILL.md');
    expect(out.templates.map((f) => f.path)).toEqual([
      'templates/spec.md',
      'templates/spec-to-code-guide.md',
    ]);
  });

  it('is deterministic for a fixed stamp', () => {
    expect(renderPlatformContent({ version: '1.0.0', now })).toEqual(
      renderPlatformContent({ version: '1.0.0', now }),
    );
  });
});

describe('upsertPlatformSection', () => {
  it('preserves user content and replaces a legacy block', () => {
    const legacy = [
      '# SOUL.md - Who You Are',
      '',
      'Local cardinal rules.',
      '',
      `<!-- ${SOUL_MARKERS.begin} | core:0.5.11 | 2026-09-25T08:39:31.418Z -->`,
      '',
      'stale',
      '',
      `<!-- ${SOUL_MARKERS.end} -->`,
      '',
    ].join('\n');
    const out = upsertPlatformSection('soul', legacy, {
      version: '1.0.0',
      now,
    });
    const parsed = parseManaged(out, SOUL_MARKERS);
    expect(parsed.beforeContent).toBe(
      '# SOUL.md - Who You Are\n\nLocal cardinal rules.',
    );
    expect(parsed.managedContent).not.toContain('stale');
    expect(parsed.versionStamp?.version).toBe('1.0.0');
  });

  it('creates a new file body when content is empty', () => {
    const out = upsertPlatformSection('agents', '', { now });
    expect(parseManaged(out, AGENTS_MARKERS).found).toBe(true);
  });
});
