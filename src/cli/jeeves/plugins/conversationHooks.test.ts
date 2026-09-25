import { describe, expect, it } from 'vitest';

import {
  conversationHooksOf,
  readDeclaredConversationHooks,
} from './conversationHooks.js';
import { failed, fakeRunner, ok } from './testRunner.js';

const PKG = '@karmaniverous/jeeves-watcher-openclaw';
const KEY = `npm view ${PKG}@1.0.0 jeeves.conversationHooks --json`;

describe('conversationHooksOf', () => {
  it('keeps only hooks gated by allowConversationAccess', () => {
    expect(
      conversationHooksOf([
        'before_prompt_build',
        'llm_input',
        'gateway_start',
        'before_tool_call',
      ]),
    ).toEqual(['before_prompt_build', 'llm_input']);
  });
});

describe('readDeclaredConversationHooks', () => {
  it('queries the exact version and returns declared conversation hooks', async () => {
    const fake = fakeRunner({ [KEY]: ok('["before_prompt_build","x"]\n') });
    await expect(
      readDeclaredConversationHooks(fake.runner, PKG, '1.0.0'),
    ).resolves.toEqual(['before_prompt_build']);
    expect(fake.lines()).toEqual([KEY]);
  });

  it('treats an absent field as no hooks', async () => {
    const fake = fakeRunner({ [KEY]: ok('') });
    await expect(
      readDeclaredConversationHooks(fake.runner, PKG, '1.0.0'),
    ).resolves.toEqual([]);
  });

  it.each([['"before_prompt_build"'], ['{"a":1}'], ['[1]']])(
    'rejects a malformed field %s',
    async (stdout) => {
      const fake = fakeRunner({ [KEY]: ok(stdout) });
      await expect(
        readDeclaredConversationHooks(fake.runner, PKG, '1.0.0'),
      ).rejects.toThrow(/must be an array of hook names/);
    },
  );

  it('rejects non-JSON output', async () => {
    const fake = fakeRunner({ [KEY]: ok('oops') });
    await expect(
      readDeclaredConversationHooks(fake.runner, PKG, '1.0.0'),
    ).rejects.toThrow(/Unexpected output/);
  });

  it('fails loudly when npm fails', async () => {
    const fake = fakeRunner({ [KEY]: failed('E404') });
    await expect(
      readDeclaredConversationHooks(fake.runner, PKG, '1.0.0'),
    ).rejects.toThrow(/exit 1/);
  });
});
