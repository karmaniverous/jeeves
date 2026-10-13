/**
 * Export-surface guard for jeeves-scripts-core (spec section 5 scope D):
 * every name scripts-core `^0.6.0` imports from `@karmaniverous/jeeves`
 * must stay exported with its 0.6.0 signature, so 0.7.0 is a drop-in
 * upgrade. Signatures are checked at compile time (`npm run typecheck`
 * covers test files); presence and kind are checked at run time.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  AccountConfig,
  GoogleAuthOptions,
  RetryOptions,
  RunOptions,
} from './index.js';
import * as jeeves from './index.js';

describe('scripts-core import surface', () => {
  it('exports every value scripts-core imports, with its 0.6.0 signature', () => {
    const functions = [
      'appendJsonl',
      'atomicWrite',
      'createGoogleAuth',
      'ensureDir',
      'nowIso',
      'parseArgs',
      'readJson',
      'run',
      'runScript',
      'runWithRetry',
      'sleepAsync',
      'sleepMs',
      'writeJsonAtomic',
    ] as const;
    expect(
      functions.filter((name) => typeof jeeves[name] !== 'function'),
    ).toEqual([]);
    expect(jeeves.META_PORT).toBe(1938);
    expect(jeeves.COMPONENT_CONFIG_PREFIX).toBe('jeeves-');
    expect(jeeves.CONFIG_FILE).toBe('config.json');

    // 0.6.0 signatures (checked by tsc).
    expectTypeOf(jeeves.nowIso).toEqualTypeOf<() => string>();
    expectTypeOf(jeeves.ensureDir).toEqualTypeOf<(p: string) => void>();
    expectTypeOf(jeeves.readJson).toEqualTypeOf<
      <T>(p: string, fallback: T) => T
    >();
    expectTypeOf(jeeves.writeJsonAtomic).toEqualTypeOf<
      (p: string, obj: unknown) => void
    >();
    expectTypeOf(jeeves.appendJsonl).toEqualTypeOf<
      (p: string, obj: unknown) => void
    >();
    expectTypeOf(jeeves.sleepMs).toEqualTypeOf<(ms: number) => void>();
    expectTypeOf(jeeves.sleepAsync).toEqualTypeOf<
      (ms: number) => Promise<void>
    >();
    expectTypeOf(jeeves.atomicWrite).toEqualTypeOf<
      (filePath: string, content: string, options?: { mode?: number }) => void
    >();
    expectTypeOf(jeeves.run).toEqualTypeOf<
      (cmd: string, args: string[], opts?: RunOptions) => string
    >();
    expectTypeOf(jeeves.runWithRetry).toEqualTypeOf<
      (cmd: string, args: string[], opts?: RetryOptions & RunOptions) => string
    >();
    expectTypeOf(jeeves.runScript).parameters.toEqualTypeOf<
      [name: string, fn: () => void | Promise<void>, crashDir?: string]
    >();
    expectTypeOf(jeeves.parseArgs).toEqualTypeOf<
      (argv?: string[]) => Record<string, string>
    >();
    expectTypeOf(jeeves.createGoogleAuth).parameters.toEqualTypeOf<
      [options: GoogleAuthOptions]
    >();
    expectTypeOf<AccountConfig>().not.toBeNever();
  });
});
