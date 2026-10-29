/**
 * Expected keys were computed with jeeves-server-core's own `crypto.ts`
 * (jeeves-server main, commit 0f6105b), so these tests prove the two
 * implementations give identical keys (#149).
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import {
  computeInsiderKey,
  computeOutsiderKeyWithExpiry,
  computePathKey,
} from './linkKeys.js';

const KEY = 'test-api-key';

describe('link keys match jeeves-server-core', () => {
  it('computeInsiderKey', () => {
    expect(computeInsiderKey(KEY)).toBe('cc21e017a6890b151d5dad9e1237d962');
    expect(computeInsiderKey('other-key')).toBe(
      'e612f16516bbe0988687ce3e9c6046c1',
    );
  });

  it('computePathKey ignores case and leading/trailing slashes', () => {
    const expected = '6c62e2d1db5d8f7109f9cf7e8ab7d845';
    expect(computePathKey(KEY, 'j/jeeves/memory/notes.md')).toBe(expected);
    expect(computePathKey(KEY, '/J/Jeeves/Memory/Notes.md//')).toBe(expected);
    expect(computePathKey(KEY, '/')).toBe('9895e63885ce12f696537ca12d7c8577');
  });

  it('computeOutsiderKeyWithExpiry: string and number expiry agree', () => {
    const expected = '0a72802b0ffa44649e663621276c9379';
    expect(
      computeOutsiderKeyWithExpiry(KEY, '/J/Docs/a.md/', '1793300000'),
    ).toBe(expected);
    expect(computeOutsiderKeyWithExpiry(KEY, 'j/docs/a.md', 1793300000)).toBe(
      expected,
    );
  });
});
