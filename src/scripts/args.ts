/**
 * The one argument parser for runnables (root export): a typed spec of
 * bare boolean flags, valued options (`--name value` or `--name=value`,
 * optionally a short alias) and positionals, read from `ctx.args`. The
 * parser ignores arguments the spec doesn't declare; {@link unknownArgs}
 * and {@link valuelessArgs} report them, so a caller can reject them.
 * Pure.
 *
 * @module
 */

/** A bare boolean flag: `true` when the exact name appears in the args. */
export interface FlagSpec {
  /** Discriminant. */
  kind: 'flag';
  /** The flag as typed, e.g. `--live`. */
  name: string;
  /** One line for `run <id> --help`. */
  description?: string;
}

/** How a valued option may also be written. */
export interface ArgValueOptions {
  /** A short alias taking its value as the next argument, e.g. `-e`. */
  alias?: string;
  /** One line for `run <id> --help`. */
  description?: string;
}

/** A valued option: its value, else the default. */
export interface ValueSpec extends ArgValueOptions {
  /** Discriminant. */
  kind: 'value';
  /** The option as typed, e.g. `--project`. */
  name: string;
  /** The value when the option is absent. */
  fallback: string;
}

/** An optional valued option: its value, else `undefined`. */
export interface OptionalSpec extends ArgValueOptions {
  /** Discriminant. */
  kind: 'optional';
  /** The option as typed, e.g. `--days`. */
  name: string;
}

/** A runnable's argument spec: result key to flag or option. */
export type ArgSpec = Record<string, FlagSpec | ValueSpec | OptionalSpec>;

/** The parsed arguments for a spec. */
export type ParsedArgs<S extends ArgSpec> = {
  [K in keyof S]: S[K] extends FlagSpec
    ? boolean
    : S[K] extends OptionalSpec
      ? string | undefined
      : string;
};

/** Declare a bare boolean flag (`--live`). `--live=true` does not set it. */
export const argFlag = (name: string, description?: string): FlagSpec => ({
  kind: 'flag',
  name,
  ...(description === undefined ? {} : { description }),
});

/** Declare a valued option with its default (`''` unless given). */
export const argValue = (
  name: string,
  fallback = '',
  options: ArgValueOptions = {},
): ValueSpec => ({ kind: 'value', name, fallback, ...options });

/** Declare an optional valued option (no default). */
export const argOptional = (
  name: string,
  options: ArgValueOptions = {},
): OptionalSpec => ({ kind: 'optional', name, ...options });

/**
 * The value of the first occurrence of a valued option, or `undefined`
 * when absent.
 *
 * @throws Error `<name> requires a value` when that occurrence has none:
 *   the end of the args, an empty `--name=`, or a next argument starting
 *   with `-`.
 */
const valueOf = (
  args: readonly string[],
  { name, alias }: ValueSpec | OptionalSpec,
): string | undefined => {
  const inline = `${name}=`;
  const i = args.findIndex(
    (a) => a === name || a.startsWith(inline) || (!!alias && a === alias),
  );
  if (i < 0) return undefined;
  const arg = args[i] ?? '';
  const found = arg.startsWith(inline) ? arg.slice(inline.length) : args[i + 1];
  if (!found || found.startsWith('-'))
    throw new Error(`${name} requires a value`);
  return found;
};

/**
 * Parse `args` (a runnable's `ctx.args`) against `spec`.
 *
 * @example
 * ```ts
 * const { live, project, days } = parseRunnableArgs(ctx.args, {
 *   live: argFlag('--live'),
 *   project: argValue('--project', 'ACME'),
 *   days: argOptional('--days', { alias: '-d' }),
 * });
 * ```
 *
 * @throws Error `<name> requires a value` when a valued option is given
 *   without one.
 */
export function parseRunnableArgs<S extends ArgSpec>(
  args: readonly string[],
  spec: S,
): ParsedArgs<S> {
  const out: Record<string, boolean | string | undefined> = {};
  for (const [key, s] of Object.entries(spec))
    out[key] =
      s.kind === 'flag'
        ? args.includes(s.name)
        : s.kind === 'optional'
          ? valueOf(args, s)
          : (valueOf(args, s) ?? s.fallback);
  return out as ParsedArgs<S>;
}

/** How {@link scanArgs} classifies one argument. */
interface ScannedArg {
  arg: string;
  kind: 'positional' | 'declared' | 'unknown' | 'valueless';
}

/**
 * Classify each argument against `spec`: a positional (not starting with
 * `-`), a declared flag or option (by name, alias or `--name=value`), or
 * an unknown option, or a declared valued option given without a value
 * (`valueless`: at the end, `--name=`, or followed by an option-like
 * argument, which is then classified on its own and never consumed). The
 * separate value of a declared valued option is consumed, never
 * classified.
 */
function scanArgs(args: readonly string[], spec: ArgSpec): ScannedArg[] {
  const specs = Object.values(spec);
  const out: ScannedArg[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('-')) {
      out.push({ arg, kind: 'positional' });
      continue;
    }
    const s = specs.find(
      (x) =>
        arg === x.name ||
        (x.kind !== 'flag' &&
          (arg === x.alias || arg.startsWith(`${x.name}=`))),
    );
    if (!s) {
      out.push({ arg, kind: 'unknown' });
      continue;
    }
    if (s.kind === 'flag') {
      out.push({ arg, kind: 'declared' });
      continue;
    }
    // A valued option: `--name=value`, or its value is the next argument,
    // which must not itself look like an option (never swallow one).
    const value = arg.includes('=')
      ? arg.slice(arg.indexOf('=') + 1)
      : args[i + 1];
    if (!value || value.startsWith('-')) {
      out.push({ arg, kind: 'valueless' });
      continue;
    }
    out.push({ arg, kind: 'declared' });
    if (!arg.includes('=')) i += 1;
  }
  return out;
}

/**
 * The arguments `spec` does not declare: an option-like argument (starting
 * with `-`) that is no flag, option or alias of `spec` (`--name=value` for
 * a valued option), and, unless `positionals` is set, any positional
 * argument. The separate value of a valued option is never reported.
 */
export function unknownArgs(
  args: readonly string[],
  spec: ArgSpec,
  positionals = false,
): string[] {
  return scanArgs(args, spec)
    .filter(
      ({ kind }) =>
        kind === 'unknown' || (kind === 'positional' && !positionals),
    )
    .map(({ arg }) => arg);
}

/**
 * The valued options given without a value, every occurrence (a repeated
 * option is checked each time, not only the first one the parser reads).
 */
export function valuelessArgs(
  args: readonly string[],
  spec: ArgSpec,
): string[] {
  return scanArgs(args, spec)
    .filter(({ kind }) => kind === 'valueless')
    .map(({ arg }) => arg.split('=')[0] ?? arg);
}

/**
 * The positional arguments: every argument that does not start with `-`
 * and is not the separate value of one of `spec`'s valued options (by name
 * or alias). `--name=value` is a single argument, so it never hides one.
 */
export function positionalArgs(
  args: readonly string[],
  spec: ArgSpec = {},
): string[] {
  return scanArgs(args, spec)
    .filter(({ kind }) => kind === 'positional')
    .map(({ arg }) => arg);
}
