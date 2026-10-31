/**
 * Tests for the runnable argument parser: bare flags, valued options in
 * every form (`--name value`, `--name=value`, alias), defaults, first
 * occurrence, missing values, unknown arguments and positionals.
 */

import { describe, expect, it } from 'vitest';

import {
  argFlag,
  argOptional,
  argValue,
  parseRunnableArgs,
  positionalArgs,
  unknownArgs,
  valuelessArgs,
} from './args.js';

describe('parseRunnableArgs', () => {
  const spec = {
    live: argFlag('--live'),
    project: argValue('--project'),
    type: argValue('--type', 'issue'),
  };

  it('reads flags and the argument after a valued option', () => {
    expect(
      parseRunnableArgs(['--project', 'ACME', '--live', 'extra'], spec),
    ).toEqual({ live: true, project: 'ACME', type: 'issue' });
  });

  it('reads the --name=value form, keeping "=" inside the value', () => {
    expect(parseRunnableArgs(['--project=ACME', '--type=a=b'], spec)).toEqual({
      live: false,
      project: 'ACME',
      type: 'a=b',
    });
  });

  it('uses defaults when an option is absent', () => {
    expect(parseRunnableArgs([], spec)).toEqual({
      live: false,
      project: '',
      type: 'issue',
    });
  });

  it.each([
    [['--dry-run'], true],
    [['x', '--dry-run', 'true'], true],
    [['--dry-run=true'], false],
    [['--dry-runs'], false],
    [['-dry-run'], false],
    [[], false],
  ])('flag --dry-run in %j -> %s', (args, expected) => {
    expect(parseRunnableArgs(args, { dry: argFlag('--dry-run') }).dry).toBe(
      expected,
    );
  });

  describe('optional options', () => {
    const opt = { env: argOptional('--env', { alias: '-e' }) };

    it.each([
      [['--env', 'prod'], 'prod'],
      [['-e', 'dev'], 'dev'],
      [['--env=bali'], 'bali'],
      [['--dry-run'], undefined],
      [[], undefined],
    ])('%j -> %s', (args, expected) => {
      expect(parseRunnableArgs(args, opt).env).toBe(expected);
    });

    it('reads a value option through its alias too', () => {
      expect(
        parseRunnableArgs(['-p', 'x'], {
          p: argValue('--profile', 'none', { alias: '-p' }),
        }).p,
      ).toBe('x');
    });

    it('ignores a short alias it was not given', () => {
      expect(
        parseRunnableArgs(['-p', 'x'], { p: argOptional('--profile') }).p,
      ).toBeUndefined();
    });
  });

  it('returns the first occurrence', () => {
    expect(
      parseRunnableArgs(['--profile', 'a', '--profile=b'], {
        p: argOptional('--profile'),
      }).p,
    ).toBe('a');
  });

  it('does not match a longer option with the same prefix', () => {
    expect(
      parseRunnableArgs(['--envelope', 'x', '--envelope=y'], {
        env: argOptional('--env'),
      }).env,
    ).toBeUndefined();
  });

  it.each([[['--env']], [['-e', '--dry-run']], [['--env=']], [['--env=-x']]])(
    'throws on a missing value: %j',
    (args) => {
      expect(() =>
        parseRunnableArgs(args, {
          env: argValue('--env', 'prod', { alias: '-e' }),
        }),
      ).toThrow('--env requires a value');
    },
  );

  it('ignores unknown arguments', () => {
    expect(parseRunnableArgs(['--bogus', '--type', 'comment'], spec)).toEqual({
      live: false,
      project: '',
      type: 'comment',
    });
  });
});

describe('positionalArgs', () => {
  it('skips flags and the separate values of valued options and aliases', () => {
    expect(
      positionalArgs(['2026', '--env', 'prod', '08', '--live', '-e', 'x'], {
        env: argOptional('--env', { alias: '-e' }),
        live: argFlag('--live'),
      }),
    ).toEqual(['2026', '08']);
  });

  it('keeps an argument after a flag or after an inline value', () => {
    expect(
      positionalArgs(['--live', '2026', '--env=prod', '08'], {
        live: argFlag('--live'),
        env: argOptional('--env'),
      }),
    ).toEqual(['2026', '08']);
  });

  it('treats every non-dash argument as positional without a spec', () => {
    expect(positionalArgs(['a', '--x', 'b'])).toEqual(['a', 'b']);
  });
});

describe('unknownArgs (#14)', () => {
  const spec = {
    live: argFlag('--live'),
    max: argValue('--max', '5', { alias: '-m' }),
    since: argOptional('--since'),
  };

  it('accepts declared flags, aliases and both value forms; skips separate values', () => {
    expect(
      unknownArgs(['--live', '--max', '3', '-m', '7', '--since=x'], spec),
    ).toEqual([]);
  });

  it('reports undeclared options, a flag given a value, and positionals unless allowed', () => {
    expect(unknownArgs(['--nope', '--live=1', 'pos'], spec)).toEqual([
      '--nope',
      '--live=1',
      'pos',
    ]);
    expect(unknownArgs(['pos'], spec, true)).toEqual([]);
  });
});

describe('valued options never swallow an option (#14)', () => {
  const spec = { project: argValue('--project', 'X'), live: argFlag('--live') };

  it('reports an undeclared option given as a repeated option value', () => {
    const args = ['--project', 'ACME', '--project', '--dryrun', '--live'];
    expect(unknownArgs(args, spec)).toEqual(['--dryrun']);
    expect(valuelessArgs(args, spec)).toEqual(['--project']);
  });

  it('checks every occurrence of a valued option, not just the first', () => {
    expect(
      valuelessArgs(['--project', 'ACME', '--project', '--live'], spec),
    ).toEqual(['--project']);
    expect(valuelessArgs(['--project=', '--project'], spec)).toEqual([
      '--project',
      '--project',
    ]);
    expect(valuelessArgs(['--project', 'ACME', '--project=B'], spec)).toEqual(
      [],
    );
  });
});
