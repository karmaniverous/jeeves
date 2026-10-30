/**
 * Pin `crypto.ts` output against known vectors computed with the original
 * `@karmaniverous/jeeves-server-core` implementations
 * (`packages/core/src/crypto.ts`, commit at the time of writing), plus the
 * edge cases covered by that package's own
 * `packages/service/src/util/crypto.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  computeInsiderKey,
  computeOutsiderKeyWithExpiry,
  computePathKey,
} from './crypto.js';

const testApiKey = 'test-api-key-12345';

describe('computePathKey', () => {
  it('pins known output for a normalized path', () => {
    expect(computePathKey(testApiKey, '/foo/bar')).toBe(
      '472ea1e2d5279dc4c890af12c5066fa6',
    );
  });

  it('pins known output for a different path', () => {
    expect(computePathKey(testApiKey, '/baz/qux')).toBe(
      'c5eb7d57fbb2f0167de687344d74d0c4',
    );
  });

  it('pins known output for a different api key', () => {
    expect(computePathKey('api-key-1', '/foo/bar')).toBe(
      'a7f701cbea2295df3ffbac0473b253cd',
    );
    expect(computePathKey('api-key-2', '/foo/bar')).toBe(
      'b77bd2cca12c3aab55d0d6021dfb3e1f',
    );
  });

  it('pins known output for an all-slashes path (normalizes to empty)', () => {
    expect(computePathKey(testApiKey, '///')).toBe(
      'a4debb563f182527222c45adadcb77fd',
    );
    expect(computePathKey(testApiKey, '')).toBe(
      'a4debb563f182527222c45adadcb77fd',
    );
  });

  it('computes a 32-character hex key', () => {
    expect(computePathKey(testApiKey, '/foo/bar')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('normalizes paths case-insensitively', () => {
    const key1 = computePathKey(testApiKey, '/Foo/Bar');
    const key2 = computePathKey(testApiKey, '/foo/bar');
    expect(key1).toBe(key2);
  });

  it('normalizes paths by trimming leading/trailing slashes', () => {
    const key1 = computePathKey(testApiKey, '/foo/bar/');
    const key2 = computePathKey(testApiKey, 'foo/bar');
    expect(key1).toBe(key2);
  });

  it('produces different keys for different paths', () => {
    const key1 = computePathKey(testApiKey, '/foo/bar');
    const key2 = computePathKey(testApiKey, '/baz/qux');
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different API keys', () => {
    const key1 = computePathKey('api-key-1', '/foo/bar');
    const key2 = computePathKey('api-key-2', '/foo/bar');
    expect(key1).not.toBe(key2);
  });
});

describe('computeInsiderKey', () => {
  it('pins known output', () => {
    expect(computeInsiderKey(testApiKey)).toBe(
      '355bee14c1157e323470b5eca15f93e2',
    );
  });

  it('pins known output for a different api key', () => {
    expect(computeInsiderKey('api-key-1')).toBe(
      'fb5b03316b850a75779df5f6072ffce9',
    );
    expect(computeInsiderKey('api-key-2')).toBe(
      'df921e68ca274cab2a44180f4008865f',
    );
  });

  it('computes a 32-character hex key', () => {
    expect(computeInsiderKey(testApiKey)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is deterministic (same API key = same insider key)', () => {
    const key1 = computeInsiderKey(testApiKey);
    const key2 = computeInsiderKey(testApiKey);
    expect(key1).toBe(key2);
  });

  it('produces different keys for different API keys', () => {
    const key1 = computeInsiderKey('api-key-1');
    const key2 = computeInsiderKey('api-key-2');
    expect(key1).not.toBe(key2);
  });
});

describe('computeOutsiderKeyWithExpiry', () => {
  const expiry1 = 1700000000000;
  const expiry2 = 1800000000000;

  it('pins known output for a numeric expiry', () => {
    expect(computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry1)).toBe(
      'c0244090e57629bbe84a4e42d8c747d6',
    );
  });

  it('pins known output for a different expiry', () => {
    expect(computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry2)).toBe(
      '40b21f64f6c6465bdef42a6056d4f476',
    );
  });

  it('pins identical output for the numeric and string forms of an expiry', () => {
    expect(
      computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', String(expiry1)),
    ).toBe('c0244090e57629bbe84a4e42d8c747d6');
  });

  it('computes a 32-character hex key', () => {
    const expiry = Date.now() + 3600000;
    const key = computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry);
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });

  it('normalizes paths case-insensitively', () => {
    const key1 = computeOutsiderKeyWithExpiry(testApiKey, '/Foo/Bar', expiry1);
    const key2 = computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry1);
    expect(key1).toBe(key2);
  });

  it('produces different keys for different expiries', () => {
    const key1 = computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry1);
    const key2 = computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry2);
    expect(key1).not.toBe(key2);
  });

  it('accepts a string expiry', () => {
    const expiry = String(Date.now() + 3600000);
    const key = computeOutsiderKeyWithExpiry(testApiKey, '/foo/bar', expiry);
    expect(key).toMatch(/^[a-f0-9]{32}$/);
  });
});
