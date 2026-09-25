import { describe, expect, it } from 'vitest';

import {
  conversationHooksOf,
  recordRegisteredHooks,
  validateConversationHooks,
} from './conversationHooks.js';
import { registerPromptContext } from './promptContext.js';
import type { PluginApi } from './types.js';

const pkg = (conversationHooks?: unknown) => ({
  name: '@karmaniverous/jeeves-x-openclaw',
  ...(conversationHooks === undefined ? {} : { jeeves: { conversationHooks } }),
});

/** A plugin whose register uses registerPromptContext and a tool. */
const promptPlugin = (api: PluginApi): void => {
  api.registerTool({
    name: 'x_status',
    description: 'status',
    parameters: {},
    execute: () => Promise.resolve({ content: [] }),
  });
  registerPromptContext(api, { content: 'Rule.' });
};

describe('conversationHooksOf', () => {
  it('keeps only hooks gated by allowConversationAccess, once each', () => {
    expect(
      conversationHooksOf([
        'before_prompt_build',
        'llm_input',
        'gateway_start',
        'before_prompt_build',
        'before_tool_call',
      ]),
    ).toEqual(['before_prompt_build', 'llm_input']);
  });
});

describe('recordRegisteredHooks', () => {
  it('records the hook registerPromptContext registers', async () => {
    await expect(recordRegisteredHooks(promptPlugin)).resolves.toEqual([
      'before_prompt_build',
    ]);
  });

  it('awaits an async register and passes extra API members', async () => {
    const seen: unknown[] = [];
    const hooks = await recordRegisteredHooks(
      async (api) => {
        await Promise.resolve();
        seen.push(api.pluginConfig);
        registerPromptContext(api, { content: () => 'x' });
      },
      { pluginConfig: { apiUrl: 'http://h:1' } },
    );
    expect(hooks).toEqual(['before_prompt_build']);
    expect(seen).toEqual([{ apiUrl: 'http://h:1' }]);
  });

  it('records nothing for a plugin without hooks', async () => {
    await expect(recordRegisteredHooks(() => undefined)).resolves.toEqual([]);
  });
});

describe('validateConversationHooks', () => {
  it('accepts a matching declaration', async () => {
    const hooks = await recordRegisteredHooks(promptPlugin);
    expect(
      validateConversationHooks(pkg(['before_prompt_build']), hooks),
    ).toEqual(['before_prompt_build']);
  });

  it('accepts no declaration when no conversation hook is registered', () => {
    expect(validateConversationHooks(pkg(), ['gateway_start'])).toEqual([]);
  });

  it.each([
    ['no field', pkg()],
    ['an empty list', pkg([])],
    ['another hook only', pkg(['llm_input'])],
  ])('rejects a missing declaration (%s)', (_label, packageJson) => {
    expect(() =>
      validateConversationHooks(packageJson, ['before_prompt_build']),
    ).toThrow(/missing: before_prompt_build/);
  });

  it.each([
    ['an unregistered conversation hook', ['before_prompt_build', 'llm_input']],
    ['a name that is not a conversation hook', ['before_prompt_build', 'x']],
  ])('rejects %s in the declaration', (_label, declared) => {
    expect(() =>
      validateConversationHooks(pkg(declared), ['before_prompt_build']),
    ).toThrow(/does not register/);
  });

  it.each([['"before_prompt_build"'], [[1]], [{ a: 1 }]])(
    'rejects a malformed field %j',
    (field) => {
      expect(() => validateConversationHooks(pkg(field), [])).toThrow(
        /must be an array of hook names/,
      );
    },
  );

  it('rejects a non-object package.json', () => {
    expect(() => validateConversationHooks('nope', [])).toThrow(
      /must be a JSON object/,
    );
  });
});
