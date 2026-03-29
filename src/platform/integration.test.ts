/**
 * End-to-end integration test: CLI seeds content, simulated component
 * plugin calls refreshPlatformContent(), verify convergence.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { z } from 'zod';

import { createComponentWriter } from '../component/createComponentWriter.js';
import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import {
  SOUL_MARKERS,
  TEMPLATES_DIR,
  TOOLS_MARKERS,
} from '../constants/index.js';
import { init, resetInit } from '../init.js';
import { parseManaged } from '../managed/parseManaged.js';
import { refreshPlatformContent } from './refreshPlatformContent.js';
import { seedContent } from './seedContent.js';

function makeTestComponent(
  overrides: Partial<JeevesComponentDescriptor> = {},
): JeevesComponentDescriptor {
  return {
    name: 'watcher',
    version: '0.10.1',
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: z.object({ watchPaths: z.array(z.string()) }),
    configFileName: 'config.json',
    initTemplate: () => ({ watchPaths: [] }),
    startCommand: (configPath: string) => [
      'node',
      'index.js',
      '-c',
      configPath,
    ],
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'Watcher search index: 464,230 chunks.',
    ...overrides,
  } as JeevesComponentDescriptor;
}

describe('end-to-end integration', () => {
  let testDir: string;
  let workspaceDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-e2e-${String(Date.now())}`);
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

  it('CLI seeds content, component writer maintains it', async () => {
    // Step 1: CLI seeds content
    await seedContent({
      coreVersion: '0.1.0',
    });

    // Verify seed
    const soulPath = join(workspaceDir, 'SOUL.md');
    const agentsPath = join(workspaceDir, 'AGENTS.md');
    const toolsPath = join(workspaceDir, 'TOOLS.md');

    expect(existsSync(soulPath)).toBe(true);
    expect(existsSync(agentsPath)).toBe(true);
    expect(existsSync(toolsPath)).toBe(true);

    const soulParsed = parseManaged(
      readFileSync(soulPath, 'utf-8'),
      SOUL_MARKERS,
    );
    expect(soulParsed.found).toBe(true);
    expect(soulParsed.versionStamp?.version).toBe('0.1.0');

    // Verify config and templates created
    expect(existsSync(join(configDir, 'jeeves-core', 'config.json'))).toBe(
      true,
    );
    expect(
      existsSync(join(configDir, 'jeeves-core', TEMPLATES_DIR, 'spec.md')),
    ).toBe(true);

    // Step 2: Component writer runs a cycle
    const writer = createComponentWriter(makeTestComponent());
    await writer.cycle();

    // Verify TOOLS.md has both Platform and Watcher sections
    const toolsContent = readFileSync(toolsPath, 'utf-8');
    const toolsParsed = parseManaged(toolsContent, TOOLS_MARKERS);
    expect(toolsParsed.found).toBe(true);
    expect(toolsParsed.sections.some((s) => s.id === 'Platform')).toBe(true);
    expect(toolsParsed.sections.some((s) => s.id === 'Watcher')).toBe(true);
    expect(
      toolsParsed.sections.find((s) => s.id === 'Watcher')?.content,
    ).toContain('464,230');

    // Step 3: Refresh platform content again (simulating another cycle)
    await refreshPlatformContent({
      coreVersion: '0.1.0',
    });

    // SOUL.md and AGENTS.md should still be intact
    const soulFinal = readFileSync(soulPath, 'utf-8');
    const soulFinalParsed = parseManaged(soulFinal, SOUL_MARKERS);
    expect(soulFinalParsed.found).toBe(true);
    expect(soulFinalParsed.managedContent).toContain('Core Truths');

    // Watcher section should still be present (not removed by platform refresh)
    const toolsFinal = readFileSync(toolsPath, 'utf-8');
    const toolsFinalParsed = parseManaged(toolsFinal, TOOLS_MARKERS);
    expect(toolsFinalParsed.sections.some((s) => s.id === 'Watcher')).toBe(
      true,
    );
  }, 30_000);
});
