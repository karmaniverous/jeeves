import { describe, expect, it, vi } from 'vitest';

import type { PromptBuildHandler } from './hookTypes.js';
import { registerPromptContext } from './promptContext.js';
import type { PluginApi } from './types.js';

type OnArgs = Parameters<NonNullable<PluginApi['on']>>;

function makeApi(withOn = true) {
  const calls: OnArgs[] = [];
  const warn = vi.fn();
  const api: PluginApi = {
    registerTool: vi.fn(),
    logger: { warn },
    ...(withOn
      ? {
          on: (...args: OnArgs) => {
            calls.push(args);
          },
        }
      : {}),
  };
  return { api, calls, warn };
}

const event = { prompt: 'hi', messages: [] };

async function invoke(handler: PromptBuildHandler) {
  return handler(event, { agentId: 'main' });
}

describe('registerPromptContext', () => {
  it('registers a before_prompt_build handler returning appendSystemContext', async () => {
    const { api, calls } = makeApi();
    expect(
      registerPromptContext(api, {
        content: '  Rule one.  ',
        priority: 5,
        timeoutMs: 1000,
      }),
    ).toBe(true);

    expect(calls).toHaveLength(1);
    const [hookName, handler, opts] = calls[0];
    expect(hookName).toBe('before_prompt_build');
    expect(opts).toEqual({
      priority: 5,
      registrationId: undefined,
      timeoutMs: 1000,
    });
    const result = await invoke(handler);
    expect(result).toEqual({ appendSystemContext: 'Rule one.' });
    expect(result).not.toHaveProperty('systemPrompt');
  });

  it('evaluates an async provider per call and passes context', async () => {
    const { api, calls } = makeApi();
    const provider = vi.fn(async (ctx: { agentId?: string }) =>
      Promise.resolve(`agent=${String(ctx.agentId)}`),
    );
    registerPromptContext(api, { content: provider });
    const handler = calls[0][1];
    expect(await invoke(handler)).toEqual({
      appendSystemContext: 'agent=main',
    });
    await invoke(handler);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it.each([[''], ['   '], [undefined]])(
    'injects nothing for blank content %j',
    async (value) => {
      const { api, calls } = makeApi();
      registerPromptContext(api, { content: () => value });
      expect(await invoke(calls[0][1])).toBeUndefined();
    },
  );

  it('swallows and logs provider errors', async () => {
    const { api, calls, warn } = makeApi();
    registerPromptContext(api, {
      content: () => {
        throw new Error('down');
      },
    });
    expect(await invoke(calls[0][1])).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('down'));
  });

  it('returns false and warns when the host lacks api.on', () => {
    const { api, warn } = makeApi(false);
    expect(registerPromptContext(api, { content: 'x' })).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('rejects invalid options', () => {
    const { api } = makeApi();
    expect(() =>
      registerPromptContext(api, { content: 42 as unknown as string }),
    ).toThrow();
  });
});
