import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { init, resetInit } from '../init';

const svc = vi.hoisted(() => ({
  install: vi.fn(),
  uninstall: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  restart: vi.fn(),
  status: vi.fn(() => 'running'),
}));

vi.mock('../service/createServiceManager', () => ({
  createServiceManager: () => svc,
}));

import { makeTestDescriptor } from '../test/makeTestDescriptor';
import { createPluginToolset } from './createPluginToolset';

describe('createPluginToolset', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-pts-test-${String(Date.now())}`);
    const configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should produce four standard tools', () => {
    const tools = createPluginToolset(makeTestDescriptor());
    expect(tools).toHaveLength(4);
  });

  it('should name tools with component prefix', () => {
    const tools = createPluginToolset(makeTestDescriptor());
    const names = tools.map((t) => t.name);
    expect(names).toContain('watcher_status');
    expect(names).toContain('watcher_config');
    expect(names).toContain('watcher_config_apply');
    expect(names).toContain('watcher_service');
  });

  it('should use correct names for different components', () => {
    const tools = createPluginToolset(
      makeTestDescriptor({ name: 'runner', defaultPort: 1937 }),
    );
    const names = tools.map((t) => t.name);
    expect(names).toContain('runner_status');
    expect(names).toContain('runner_config');
    expect(names).toContain('runner_config_apply');
    expect(names).toContain('runner_service');
  });

  it('should have descriptions on all tools', () => {
    const tools = createPluginToolset(makeTestDescriptor());
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  it('should have parameter schemas on all tools', () => {
    const tools = createPluginToolset(makeTestDescriptor());
    for (const tool of tools) {
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.parameters).toBe('object');
    }
  });

  it('should have executable handlers on all tools', () => {
    const tools = createPluginToolset(makeTestDescriptor());
    for (const tool of tools) {
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('status tool should return connection error for unreachable service', async () => {
    const tools = createPluginToolset(
      makeTestDescriptor({ defaultPort: 19999 }),
    );
    const statusTool = tools.find((t) => t.name === 'watcher_status');
    expect(statusTool).toBeDefined();

    const result = await statusTool!.execute('test-id', {});
    expect(result.isError).toBe(true);
  });

  it('service tool should reject invalid actions', async () => {
    const tools = createPluginToolset(makeTestDescriptor());
    const serviceTool = tools.find((t) => t.name === 'watcher_service');
    expect(serviceTool).toBeDefined();

    const result = await serviceTool!.execute('test-id', {
      action: 'invalid',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid action');
  });

  it('config_apply tool should reject missing config', async () => {
    const tools = createPluginToolset(makeTestDescriptor());
    const applyTool = tools.find((t) => t.name === 'watcher_config_apply');
    expect(applyTool).toBeDefined();

    const result = await applyTool!.execute('test-id', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Missing');
  });

  describe('service URL', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
    });

    const calledUrls = (): string[] =>
      fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));

    const runHttpTools = async (
      tools: ReturnType<typeof createPluginToolset>,
    ): Promise<void> => {
      const byName = (n: string) => tools.find((t) => t.name === n)!;
      await byName('watcher_status').execute('id', {});
      await byName('watcher_config').execute('id', { path: '$.a' });
      await byName('watcher_config_apply').execute('id', { config: { a: 1 } });
    };

    it('uses a custom apiUrl for every HTTP tool', async () => {
      await runHttpTools(
        createPluginToolset(makeTestDescriptor(), {
          apiUrl: 'http://10.0.0.5:2936/',
        }),
      );
      expect(calledUrls()).toEqual([
        'http://10.0.0.5:2936/status',
        'http://10.0.0.5:2936/config?path=%24.a',
        'http://10.0.0.5:2936/config/apply',
      ]);
    });

    it('falls back to the descriptor defaultPort when apiUrl is unset', async () => {
      await runHttpTools(
        createPluginToolset(makeTestDescriptor({ defaultPort: 1936 })),
      );
      expect(calledUrls()).toEqual([
        'http://127.0.0.1:1936/status',
        'http://127.0.0.1:1936/config?path=%24.a',
        'http://127.0.0.1:1936/config/apply',
      ]);
    });

    it('evaluates a lazy apiUrl resolver on each call', async () => {
      let current: string | undefined = 'http://first:1';
      const resolver = vi.fn(() => current);
      const tools = createPluginToolset(makeTestDescriptor(), {
        apiUrl: resolver,
      });
      expect(resolver).not.toHaveBeenCalled();
      const status = tools.find((t) => t.name === 'watcher_status')!;
      await status.execute('id', {});
      current = 'http://second:2';
      await status.execute('id', {});
      current = undefined;
      await status.execute('id', {});
      expect(resolver).toHaveBeenCalledTimes(3);
      expect(calledUrls()).toEqual([
        'http://first:1/status',
        'http://second:2/status',
        'http://127.0.0.1:1936/status',
      ]);
    });
  });

  describe('error paths', () => {
    const tool = (n: string) =>
      createPluginToolset(makeTestDescriptor()).find((t) => t.name === n)!;

    it('status tool reports a non-OK HTTP response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response('boom', { status: 500 }))),
      );
      const result = await tool('watcher_status').execute('id', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('HTTP 500: boom');
    });

    it.each(['watcher_config', 'watcher_config_apply'])(
      '%s reports a connection failure',
      async (name) => {
        vi.stubGlobal(
          'fetch',
          vi.fn(() => Promise.reject(new Error('down'))),
        );
        const result = await tool(name).execute('id', { config: { a: 1 } });
        expect(result.isError).toBe(true);
      },
    );
  });

  describe('service tool', () => {
    const serviceTool = () =>
      createPluginToolset(makeTestDescriptor()).find(
        (t) => t.name === 'watcher_service',
      )!;

    it('reports service status', async () => {
      const result = await serviceTool().execute('id', { action: 'status' });
      expect(JSON.parse(result.content[0].text)).toEqual({
        service: 'watcher',
        state: 'running',
      });
    });

    it.each(['install', 'uninstall', 'start', 'stop', 'restart'] as const)(
      'runs %s',
      async (action) => {
        const result = await serviceTool().execute('id', { action });
        expect(svc[action]).toHaveBeenCalled();
        expect(result.isError).toBeFalsy();
      },
    );

    it('reports a failing action', async () => {
      svc.start.mockImplementationOnce(() => {
        throw new Error('nope');
      });
      const result = await serviceTool().execute('id', { action: 'start' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Service start failed: nope');
    });
  });
});
