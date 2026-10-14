import { describe, expect, it } from 'vitest';

import {
  allMatches,
  lineOf,
  planAcrossFiles,
  type TextPatchResult,
} from './textPatch.js';

describe('lineOf', () => {
  it('returns 1-based line numbers', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 4)).toBe(3);
  });
});

describe('allMatches', () => {
  it('returns every match of a global regex', () => {
    expect(allMatches('a1 b2 c3', /\d/g).map((m) => m[0])).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('rejects non-global regexes', () => {
    expect(() => allMatches('x', /x/)).toThrow(/global/);
  });
});

describe('planAcrossFiles', () => {
  const patch: TextPatchResult = {
    status: 'patch',
    content: 'x',
    line: 1,
    before: 'a',
    after: 'b',
  };
  const done: TextPatchResult = {
    status: 'already-patched',
    line: 1,
    snippet: 'b',
  };
  const fixed: TextPatchResult = {
    status: 'upstream-fixed',
    line: 3,
    snippet: 'c',
  };
  const none: TextPatchResult = { status: 'not-found' };

  it.each([
    ['a patch site', patch],
    ['an already-patched site', done],
    ['an upstream-fixed site', fixed],
  ])('selects the single file with %s', (_label, result) => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: none },
      { file: 'b.mjs', result },
    ]);
    expect(plan).toEqual({ status: 'found', file: 'b.mjs', result });
  });

  it('reports not-found when no file has the site', () => {
    const plan = planAcrossFiles([{ file: 'a.mjs', result: none }]);
    expect(plan).toEqual({
      status: 'not-found',
      message: 'patch site not found in any file',
    });
    expect(planAcrossFiles([]).status).toBe('not-found');
  });

  it('errors when several files have the site, naming them', () => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: patch },
      { file: 'b.js', result: fixed },
    ]);
    expect(plan).toEqual({
      status: 'error',
      message: 'patch site found in 2 files (expected 1): a.mjs, b.js',
    });
  });

  it('propagates per-file ambiguity as an error', () => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: { status: 'ambiguous', detail: '2 matches' } },
      { file: 'b.mjs', result: patch },
    ]);
    expect(plan).toEqual({ status: 'error', message: 'a.mjs: 2 matches' });
  });
});
