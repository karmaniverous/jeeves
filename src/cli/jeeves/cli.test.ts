/**
 * CLI command tests for install, uninstall, and status.
 *
 * @remarks
 * Tests the CLI commands by directly calling the underlying functions
 * rather than spawning processes, for speed and reliability.
 */

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

import {
  AGENTS_MARKERS,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
} from '../../constants/index.js';
import { init, resetInit } from '../../init.js';
import { parseManaged } from '../../managed/parseManaged.js';
import { seedContent } from '../../platform/seedContent.js';

describe('CLI commands', () => {
  let testDir: string;
  let workspaceDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-cli-test-${String(Date.now())}`);
    workspaceDir = join(testDir, 'workspace');
    configDir = join(testDir, 'config');
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    init({ workspacePath: workspaceDir, configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('install', () => {
    it('should seed SOUL.md with managed section', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const soulPath = join(workspaceDir, 'SOUL.md');
      expect(existsSync(soulPath)).toBe(true);

      const content = readFileSync(soulPath, 'utf-8');
      const parsed = parseManaged(content, SOUL_MARKERS);
      expect(parsed.found).toBe(true);
      expect(parsed.managedContent).toContain('Core Truths');
    }, 15_000);

    it('should seed AGENTS.md with managed section', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const agentsPath = join(workspaceDir, 'AGENTS.md');
      expect(existsSync(agentsPath)).toBe(true);

      const content = readFileSync(agentsPath, 'utf-8');
      const parsed = parseManaged(content, AGENTS_MARKERS);
      expect(parsed.found).toBe(true);
      expect(parsed.managedContent).toContain('Context Compaction Recovery');
    }, 15_000);

    it('should seed TOOLS.md Platform section', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const toolsPath = join(workspaceDir, 'TOOLS.md');
      expect(existsSync(toolsPath)).toBe(true);

      const content = readFileSync(toolsPath, 'utf-8');
      const parsed = parseManaged(content, TOOLS_MARKERS);
      expect(parsed.found).toBe(true);
      expect(parsed.sections.some((s) => s.id === 'Platform')).toBe(true);
    }, 15_000);

    it('should create core config with defaults', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const configPath = join(configDir, 'jeeves-core', 'config.json');
      expect(existsSync(configPath)).toBe(true);

      const raw = readFileSync(configPath, 'utf-8');
      const config: unknown = JSON.parse(raw);
      expect(config).toHaveProperty('$schema');
      expect(config).toHaveProperty('owners');
    }, 15_000);

    it('should copy templates to config directory', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const templatesDir = join(configDir, 'jeeves-core', TEMPLATES_DIR);
      expect(existsSync(templatesDir)).toBe(true);
      expect(existsSync(join(templatesDir, 'spec.md'))).toBe(true);
    }, 15_000);

    it('should not overwrite existing core config', async () => {
      const coreConfigDir = join(configDir, 'jeeves-core');
      mkdirSync(coreConfigDir, { recursive: true });
      const configPath = join(coreConfigDir, 'config.json');
      writeFileSync(
        configPath,
        JSON.stringify({ owners: ['custom-owner'] }),
        'utf-8',
      );

      await seedContent({
        coreVersion: '0.1.0',
      });

      const raw = readFileSync(configPath, 'utf-8');
      expect(raw).toContain('custom-owner');
    }, 15_000);

    it('should preserve user content in existing SOUL.md', async () => {
      const soulPath = join(workspaceDir, 'SOUL.md');
      writeFileSync(soulPath, '# My Soul\n\nI am unique.\n', 'utf-8');

      await seedContent({
        coreVersion: '0.1.0',
      });

      const content = readFileSync(soulPath, 'utf-8');
      const parsed = parseManaged(content, SOUL_MARKERS);
      expect(parsed.found).toBe(true);
      // With position: 'bottom', user content is before the managed block
      expect(parsed.beforeContent).toContain('I am unique.');
    }, 15_000);

    it('should trigger cleanup flag for duplicated content', async () => {
      // Put soul-section content in the file as "user content"
      // that closely mirrors the managed section content — enough
      // 3-word shingles to exceed the 0.15 Jaccard threshold.
      const soulPath = join(workspaceDir, 'SOUL.md');
      // Read the actual soul-section.md content and use it as
      // orphaned user content (simulating a recovery scenario)
      const { readFileSync: readFs } = await import('node:fs');
      const { dirname, join: joinPath } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const contentDir = joinPath(thisDir, '..', '..', '..', 'content');
      const soulSection = readFs(
        joinPath(contentDir, 'soul-section.md'),
        'utf-8',
      );
      writeFileSync(soulPath, soulSection, 'utf-8');

      await seedContent({
        coreVersion: '0.1.0',
      });

      const content = readFileSync(soulPath, 'utf-8');
      expect(content).toContain('CLEANUP NEEDED');
    }, 15_000);

    it('should seed HEARTBEAT.md with platform status for all components', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const heartbeatPath = join(workspaceDir, 'HEARTBEAT.md');
      expect(existsSync(heartbeatPath)).toBe(true);

      const content = readFileSync(heartbeatPath, 'utf-8');
      expect(content).toContain('# Jeeves Platform Status');
      expect(content).toContain('## jeeves-runner');
      expect(content).toContain('## jeeves-watcher');
      expect(content).toContain('## jeeves-server');
      expect(content).toContain('## jeeves-meta');
      expect(content).toContain('Not installed');
    }, 15_000);

    it('should seed the jeeves workspace skill', async () => {
      await seedContent({
        coreVersion: '0.1.0',
      });

      const skillPath = join(workspaceDir, 'skills', 'jeeves', 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('name: jeeves');
      expect(content).toContain('Jeeves Platform Skill');
    }, 15_000);

    it('should overwrite an existing jeeves workspace skill on install', async () => {
      const skillDir = join(workspaceDir, 'skills', 'jeeves');
      mkdirSync(skillDir, { recursive: true });
      const skillPath = join(skillDir, 'SKILL.md');
      writeFileSync(skillPath, 'old skill', 'utf-8');

      await seedContent({
        coreVersion: '0.1.0',
      });

      const content = readFileSync(skillPath, 'utf-8');
      expect(content).not.toBe('old skill');
      expect(content).toContain('Jeeves Platform Skill');
    }, 15_000);
  });

  describe('uninstall', () => {
    it('should remove managed sections from all files', async () => {
      // First install
      await seedContent({
        coreVersion: '0.1.0',
      });

      // Verify install worked
      const soulPath = join(workspaceDir, 'SOUL.md');
      expect(
        parseManaged(readFileSync(soulPath, 'utf-8'), SOUL_MARKERS).found,
      ).toBe(true);

      // Now uninstall by removing managed blocks
      const { removeManagedBlockFromFile } =
        await import('./uninstallHelpers.js');
      removeManagedBlockFromFile(soulPath, SOUL_MARKERS);
      removeManagedBlockFromFile(
        join(workspaceDir, 'AGENTS.md'),
        AGENTS_MARKERS,
      );
      removeManagedBlockFromFile(join(workspaceDir, 'TOOLS.md'), TOOLS_MARKERS);

      // Verify managed sections removed
      const soulContent = readFileSync(soulPath, 'utf-8');
      const parsed = parseManaged(soulContent, SOUL_MARKERS);
      expect(parsed.found).toBe(false);
    }, 15_000);
  });
});
