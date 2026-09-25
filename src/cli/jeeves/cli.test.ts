/**
 * Tests for the install/uninstall filesystem adapters.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  AGENTS_MARKERS,
  LEGACY_TOOLS_MARKERS,
  SOUL_MARKERS,
} from '../../constants/index.js';
import { parseManaged } from '../../managed/parseManaged.js';
import { useTempDir } from '../../test/tempDir.js';
import { installPlatformContent } from './installPlatformContent.js';
import { removeManagedBlockFromFile } from './uninstallHelpers.js';

describe('installPlatformContent', () => {
  let testDir: string;
  let workspacePath: string;
  let coreConfigDir: string;

  const tempDir = useTempDir('jeeves-cli-test-');
  beforeEach(() => {
    testDir = tempDir();
    workspacePath = join(testDir, 'workspace');
    coreConfigDir = join(testDir, 'config', 'jeeves-core');
    mkdirSync(workspacePath, { recursive: true });
  });

  const install = () =>
    installPlatformContent({ workspacePath, coreConfigDir, version: '1.0.0' });
  const read = (...p: string[]) => readFileSync(join(...p), 'utf-8');

  it('writes SOUL/AGENTS blocks, skills, templates, and core config', () => {
    const written = install();
    expect(written.length).toBeGreaterThan(0);

    expect(
      parseManaged(read(workspacePath, 'SOUL.md'), SOUL_MARKERS).managedContent,
    ).toContain('Core Truths');
    expect(
      parseManaged(read(workspacePath, 'AGENTS.md'), AGENTS_MARKERS).found,
    ).toBe(true);
    expect(read(workspacePath, 'skills', 'jeeves', 'SKILL.md')).toContain(
      'name: jeeves',
    );
    expect(existsSync(join(coreConfigDir, 'templates', 'spec.md'))).toBe(true);
    const config: unknown = JSON.parse(read(coreConfigDir, 'config.json'));
    expect(config).toHaveProperty('$schema');
    expect(existsSync(join(coreConfigDir, 'config.schema.json'))).toBe(true);
  });

  it('never writes TOOLS.md or HEARTBEAT.md', () => {
    install();
    expect(existsSync(join(workspacePath, 'TOOLS.md'))).toBe(false);
    expect(existsSync(join(workspacePath, 'HEARTBEAT.md'))).toBe(false);
  });

  it('preserves user content and is idempotent', () => {
    writeFileSync(join(workspacePath, 'SOUL.md'), '# Mine\n\nUnique.\n');
    install();
    install();
    const soul = read(workspacePath, 'SOUL.md');
    expect(parseManaged(soul, SOUL_MARKERS).beforeContent).toBe(
      '# Mine\n\nUnique.',
    );
    expect(soul.split(SOUL_MARKERS.begin)).toHaveLength(2);
  });

  it('does not overwrite an existing core config', () => {
    mkdirSync(coreConfigDir, { recursive: true });
    writeFileSync(join(coreConfigDir, 'config.json'), '{"owners":["me"]}');
    install();
    expect(read(coreConfigDir, 'config.json')).toContain('"me"');
  });

  it('dry run reports the same writes and touches nothing', () => {
    const planned = installPlatformContent({
      workspacePath,
      coreConfigDir,
      version: '1.0.0',
      dryRun: true,
    });
    expect(planned).toEqual(install().map((line) => line));
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(workspacePath, { recursive: true });
    installPlatformContent({
      workspacePath,
      coreConfigDir,
      version: '1.0.0',
      dryRun: true,
    });
    expect(existsSync(join(workspacePath, 'SOUL.md'))).toBe(false);
    expect(existsSync(coreConfigDir)).toBe(false);
  });

  it('overwrites a stale platform skill', () => {
    const skill = join(workspacePath, 'skills', 'jeeves', 'SKILL.md');
    mkdirSync(join(workspacePath, 'skills', 'jeeves'), { recursive: true });
    writeFileSync(skill, 'old');
    install();
    expect(readFileSync(skill, 'utf-8')).toContain('Jeeves Platform Skill');
  });
});

describe('removeManagedBlockFromFile', () => {
  let testDir: string;

  const tempDir = useTempDir('jeeves-uninstall-');
  beforeEach(() => {
    testDir = tempDir();
  });

  it('removes a legacy TOOLS.md block and keeps user content', () => {
    const file = join(testDir, 'TOOLS.md');
    writeFileSync(
      file,
      [
        'My tools notes.',
        '',
        `<!-- ${LEGACY_TOOLS_MARKERS.begin} | core:0.5.12 | 2026-09-01T00:00:00Z -->`,
        '## Platform',
        `<!-- ${LEGACY_TOOLS_MARKERS.end} -->`,
      ].join('\n'),
    );
    expect(removeManagedBlockFromFile(file, LEGACY_TOOLS_MARKERS)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe('My tools notes.\n');
  });

  it('dry run reports a removable block without writing', () => {
    const file = join(testDir, 'SOUL.md');
    const content = [
      'Mine.',
      '',
      `<!-- ${SOUL_MARKERS.begin} | core:1.0.0 | 2026-09-01T00:00:00Z -->`,
      'x',
      `<!-- ${SOUL_MARKERS.end} -->`,
    ].join('\n');
    writeFileSync(file, content);
    expect(removeManagedBlockFromFile(file, SOUL_MARKERS, true)).toBe(true);
    expect(readFileSync(file, 'utf-8')).toBe(content);
  });

  it('returns false for a missing file or absent block', () => {
    expect(
      removeManagedBlockFromFile(join(testDir, 'nope.md'), SOUL_MARKERS),
    ).toBe(false);
    const file = join(testDir, 'SOUL.md');
    writeFileSync(file, 'Just me.');
    expect(removeManagedBlockFromFile(file, SOUL_MARKERS)).toBe(false);
    expect(readFileSync(file, 'utf-8')).toBe('Just me.');
  });
});
