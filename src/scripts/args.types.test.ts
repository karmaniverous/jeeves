/**
 * Type-level guard for `parseRunnableArgs`: its result is built with one
 * assertion (`as ParsedArgs<S>`), so these checks pin that each spec kind
 * maps to the right property type and that the runtime values agree.
 * Kept apart from `args.test.ts`, which stays identical to
 * jeeves-scripts-core's copy.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  argFlag,
  argOptional,
  argValue,
  type ParsedArgs,
  parseRunnableArgs,
} from './args.js';

const spec = {
  live: argFlag('--live'),
  project: argValue('--project', 'ACME'),
  days: argOptional('--days', { alias: '-d' }),
};

describe('parseRunnableArgs result type', () => {
  it('maps flag to boolean, value to string, optional to string | undefined', () => {
    expectTypeOf<ParsedArgs<typeof spec>>().toEqualTypeOf<{
      live: boolean;
      project: string;
      days: string | undefined;
    }>();

    const parsed = parseRunnableArgs(['--live', '-d', '7'], spec);
    expectTypeOf(parsed).toEqualTypeOf<ParsedArgs<typeof spec>>();
    expect(parsed).toEqual({ live: true, project: 'ACME', days: '7' });
    expect(parseRunnableArgs([], spec)).toEqual({
      live: false,
      project: 'ACME',
      days: undefined,
    });
  });
});
