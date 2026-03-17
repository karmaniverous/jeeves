/**
 * Tests for refreshPlatformContent.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENTS_MARKERS,
  SOUL_MARKERS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
} from '../constants/index.js';
import { init, resetInit } from '../init.js';
import { parseManaged } from '../managed/parseManaged.js';
import { refreshPlatformContent } from './refreshPlatformContent.js';

describe('refreshPlatformContent', () => {
  let testDir: string;
  let workspaceDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-rpc-test-${String(Date.now())}`);
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

  it('should create SOUL.md with managed section', async () => {
    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const soulPath = join(workspaceDir, 'SOUL.md');
    expect(existsSync(soulPath)).toBe(true);

    const content = readFileSync(soulPath, 'utf-8');
    const parsed = parseManaged(content, SOUL_MARKERS);
    expect(parsed.found).toBe(true);
    expect(parsed.managedContent).toContain('Core Truths');
    expect(parsed.managedContent).toContain('Genesis');
  }, 15_000);

  it('should create AGENTS.md with managed section', async () => {
    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const agentsPath = join(workspaceDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);

    const content = readFileSync(agentsPath, 'utf-8');
    const parsed = parseManaged(content, AGENTS_MARKERS);
    expect(parsed.found).toBe(true);
    expect(parsed.managedContent).toContain('Memory Architecture');
    expect(parsed.managedContent).toContain('Cost Consciousness');
  }, 15_000);

  it('should write TOOLS.md Platform section', async () => {
    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const toolsPath = join(workspaceDir, 'TOOLS.md');
    expect(existsSync(toolsPath)).toBe(true);

    const content = readFileSync(toolsPath, 'utf-8');
    const parsed = parseManaged(content, TOOLS_MARKERS);
    expect(parsed.found).toBe(true);
    expect(parsed.sections.some((s) => s.id === 'Platform')).toBe(true);

    const platform = parsed.sections.find((s) => s.id === 'Platform');
    expect(platform?.content).toContain('Service Health');
  }, 15_000);

  it('should include version stamp in markers', async () => {
    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const soulPath = join(workspaceDir, 'SOUL.md');
    const content = readFileSync(soulPath, 'utf-8');
    expect(content).toContain('core:0.1.0');
  }, 15_000);

  it('should copy templates to config directory', async () => {
    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const templatesDir = join(configDir, 'jeeves-core', TEMPLATES_DIR);
    expect(existsSync(templatesDir)).toBe(true);
    expect(existsSync(join(templatesDir, 'spec.md'))).toBe(true);
    expect(existsSync(join(templatesDir, 'spec-to-code-guide.md'))).toBe(true);
  }, 15_000);

  it('should preserve user content in SOUL.md', async () => {
    // Create SOUL.md with user content and existing managed section
    const soulPath = join(workspaceDir, 'SOUL.md');
    const existingContent = [
      '# My Soul',
      '',
      'I am a unique personality.',
      '',
    ].join('\n');
    mkdirSync(workspaceDir, { recursive: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(soulPath, existingContent, 'utf-8');

    await refreshPlatformContent({
      coreVersion: '0.1.0',
      skipRegistryCheck: true,
      probeTimeoutMs: 100,
    });

    const content = readFileSync(soulPath, 'utf-8');
    const parsed = parseManaged(content, SOUL_MARKERS);
    expect(parsed.found).toBe(true);
    // User content should be preserved below the managed block
    expect(parsed.userContent).toContain('I am a unique personality.');
  }, 15_000);
});
