/**
 * Type-level guard for `parseRunnableArgs`: its result is built with one
 * assertion (`as ParsedArgs<S>`), so these checks pin that each spec kind
 * maps to the right property type and that the runtime values agree.
 * Also covers what jeeves adds beyond jeeves-scripts-core's tests (the
 * `description` fields). Kept apart from `args.test.ts`, which stays
 * identical to jeeves-scripts-core's copy.
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

describe('descriptions', () => {
  it('keeps a flag description, and omits the key without one', () => {
    expect(argFlag('--live', 'Write for real')).toEqual({
      kind: 'flag',
      name: '--live',
      description: 'Write for real',
    });
    expect(argFlag('--live')).not.toHaveProperty('description');
  });

  it('keeps valued and optional option descriptions', () => {
    expect(argValue('--max', '5', { description: 'Cap' })).toMatchObject({
      description: 'Cap',
    });
    expect(argOptional('--since', { description: 'Start' })).toMatchObject({
      description: 'Start',
    });
  });

  it('does not change what the parser reads', () => {
    const described = {
      live: argFlag('--live', 'Write for real'),
      max: argValue('--max', '5', { description: 'Cap' }),
    };
    expect(parseRunnableArgs(['--live', '--max', '3'], described)).toEqual({
      live: true,
      max: '3',
    });
  });
});
