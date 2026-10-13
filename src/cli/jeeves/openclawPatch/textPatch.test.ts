import { describe, expect, it } from 'vitest';

import {
  allMatches,
  evaluateAnchoredPatch,
  lineOf,
  planAcrossFiles,
  type TextPatchResult,
} from './textPatch.js';

const UNPATCHED = /flag:\s*true/g;
const PATCHED = /flag:\s*false/g;
const flip = (m: string): string => m.replace('true', 'false');

describe('lineOf', () => {
  it('returns 1-based line numbers', () => {
    expect(lineOf('a\nb\nc', 0)).toBe(1);
    expect(lineOf('a\nb\nc', 4)).toBe(3);
  });
});

describe('allMatches', () => {
  it('rejects non-global regexes', () => {
    expect(() => allMatches('x', /x/)).toThrow(/global/);
  });
});

describe('evaluateAnchoredPatch', () => {
  it('patches a single unpatched site', () => {
    const r = evaluateAnchoredPatch('a\nflag: true;', UNPATCHED, PATCHED, flip);
    expect(r).toEqual({
      status: 'patch',
      content: 'a\nflag: false;',
      line: 2,
      before: 'flag: true',
      after: 'flag: false',
    });
  });

  it('detects already patched', () => {
    const r = evaluateAnchoredPatch('flag: false', UNPATCHED, PATCHED, flip);
    expect(r.status).toBe('already-patched');
  });

  it('reports not-found', () => {
    expect(evaluateAnchoredPatch('', UNPATCHED, PATCHED, flip).status).toBe(
      'not-found',
    );
  });

  it.each([
    'flag: true flag: true',
    'flag: true flag: false',
    'flag: false flag: false',
  ])('is ambiguous for %j', (content) => {
    expect(
      evaluateAnchoredPatch(content, UNPATCHED, PATCHED, flip).status,
    ).toBe('ambiguous');
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
  const none: TextPatchResult = { status: 'not-found' };

  it('selects the single file with a patch site', () => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: none },
      { file: 'b.mjs', result: patch },
    ]);
    expect(plan).toEqual({ status: 'patch', file: 'b.mjs', result: patch });
  });

  it('reports already patched', () => {
    const plan = planAcrossFiles([{ file: 'a.mjs', result: done }]);
    expect(plan.status).toBe('already-patched');
  });

  it('reports not-found when no file has the site', () => {
    const plan = planAcrossFiles([{ file: 'a.mjs', result: none }]);
    expect(plan).toEqual({
      status: 'not-found',
      message: 'patch site not found in any file',
    });
    expect(planAcrossFiles([]).status).toBe('not-found');
  });

  it('errors when several files have the site', () => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: patch },
      { file: 'b.js', result: done },
    ]);
    expect(plan.status).toBe('error');
    if (plan.status !== 'error') return;
    expect(plan.message).toContain('a.mjs, b.js');
  });

  it('propagates per-file ambiguity as an error', () => {
    const plan = planAcrossFiles([
      { file: 'a.mjs', result: { status: 'ambiguous', detail: '2 matches' } },
      { file: 'b.mjs', result: patch },
    ]);
    expect(plan).toEqual({ status: 'error', message: 'a.mjs: 2 matches' });
  });
});
