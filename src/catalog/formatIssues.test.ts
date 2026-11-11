import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { formatIssues } from './formatIssues.js';

describe('formatIssues', () => {
  it('joins each issue’s dotted path and message with "; "', () => {
    const result = z
      .object({ a: z.object({ b: z.number() }), c: z.string() })
      .safeParse({ a: { b: 'x' }, c: 1 });
    expect(formatIssues(result.error?.issues ?? [])).toBe(
      'a.b: Invalid input: expected number, received string; c: Invalid input: expected string, received number',
    );
  });

  it('labels a root-level issue "(input)"', () => {
    const result = z.string().safeParse(1);
    expect(formatIssues(result.error?.issues ?? [])).toBe(
      '(input): Invalid input: expected string, received number',
    );
  });

  it('is empty for no issues', () => {
    expect(formatIssues([])).toBe('');
  });
});
