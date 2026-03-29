import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { JeevesComponentDescriptor } from '../component/descriptor';
import { init, resetInit } from '../init';
import { createPluginToolset } from './createPluginToolset';

function makeDescriptor(
  overrides: Partial<JeevesComponentDescriptor> = {},
): JeevesComponentDescriptor {
  return {
    name: 'watcher',
    version: '0.11.1',
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
    generateToolsContent: () => 'content',
    ...overrides,
  } as JeevesComponentDescriptor;
}

describe('createPluginToolset', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-pts-test-${String(Date.now())}`);
    const configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should produce four standard tools', () => {
    const tools = createPluginToolset(makeDescriptor());
    expect(tools).toHaveLength(4);
  });

  it('should name tools with component prefix', () => {
    const tools = createPluginToolset(makeDescriptor());
    const names = tools.map((t) => t.name);
    expect(names).toContain('watcher_status');
    expect(names).toContain('watcher_config');
    expect(names).toContain('watcher_config_apply');
    expect(names).toContain('watcher_service');
  });

  it('should use correct names for different components', () => {
    const tools = createPluginToolset(
      makeDescriptor({ name: 'runner', defaultPort: 1937 }),
    );
    const names = tools.map((t) => t.name);
    expect(names).toContain('runner_status');
    expect(names).toContain('runner_config');
    expect(names).toContain('runner_config_apply');
    expect(names).toContain('runner_service');
  });

  it('should have descriptions on all tools', () => {
    const tools = createPluginToolset(makeDescriptor());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('should have parameter schemas on all tools', () => {
    const tools = createPluginToolset(makeDescriptor());
    for (const tool of tools) {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('should have executable handlers on all tools', () => {
    const tools = createPluginToolset(makeDescriptor());
    for (const tool of tools) {
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('status tool should return connection error for unreachable service', async () => {
    const tools = createPluginToolset(makeDescriptor({ defaultPort: 19999 }));
    const statusTool = tools.find((t) => t.name === 'watcher_status');
    expect(statusTool).toBeDefined();

    const result = await statusTool!.execute('test-id', {});
    expect(result.isError).toBe(true);
  });

  it('service tool should reject invalid actions', async () => {
    const tools = createPluginToolset(makeDescriptor());
    const serviceTool = tools.find((t) => t.name === 'watcher_service');
    expect(serviceTool).toBeDefined();

    const result = await serviceTool!.execute('test-id', {
      action: 'invalid',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid action');
  });

  it('config_apply tool should reject missing config', async () => {
    const tools = createPluginToolset(makeDescriptor());
    const applyTool = tools.find((t) => t.name === 'watcher_config_apply');
    expect(applyTool).toBeDefined();

    const result = await applyTool!.execute('test-id', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing');
  });
});
