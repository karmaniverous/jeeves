import { describe, expect, it, vi } from 'vitest';

import type { PluginApi, ToolResult } from './types.js';

describe('plugin/types', () => {
  it('PluginApi accepts a full API object', () => {
    const registerTool = vi.fn();
    const api: PluginApi = {
      config: {
        agents: { defaults: { workspace: '/workspace' } },
        plugins: {
          entries: {
            'my-plugin': { config: { apiUrl: 'http://localhost:1234' } },
          },
        },
      },
      resolvePath: (input: string) => `/resolved/${input}`,
      registerTool,
    };

    api.registerTool(
      {
        name: 'test-tool',
        description: 'A test tool',
        parameters: {},
        execute: () =>
          Promise.resolve({
            content: [{ type: 'text', text: 'ok' }],
          }),
      },
      { optional: true },
    );

    expect(registerTool).toHaveBeenCalledOnce();
  });

  it('PluginApi works with minimal fields', () => {
    const api: PluginApi = {
      registerTool: vi.fn(),
    };

    expect(api.config).toBeUndefined();
    expect(api.resolvePath).toBeUndefined();
  });

  it('ToolResult supports isError flag', () => {
    const result: ToolResult = {
      content: [{ type: 'text', text: 'Error: something failed' }],
      isError: true,
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});
