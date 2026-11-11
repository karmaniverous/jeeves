import createError from '@fastify/error';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  defineError,
  type HttpErrorStatus,
  isDeliberateError,
} from './defineError.js';

describe('defineError', () => {
  it('makes a createError class: code, status and formatted message', () => {
    const JobExists = defineError(
      'RUNNER_JOB_EXISTS',
      'Job %s already exists',
      409,
    );
    const error = new JobExists('j1');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(JobExists);
    expect(error.code).toBe('RUNNER_JOB_EXISTS');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Job j1 already exists');
    expect(error.name).toBe('FastifyError');
    expect(typeof error.stack).toBe('string');
    expect(JobExists('j2').message).toBe('Job j2 already exists');
  });

  it('brands the class, not as an own or enumerable field', () => {
    const Busy = defineError('ACME_BUSY', 'Busy', 503);
    const error = new Busy();
    expect(isDeliberateError(error)).toBe(true);
    expect(Object.getOwnPropertySymbols(error)).toEqual([]);
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: 'ACME_BUSY',
      message: 'Busy',
      name: 'FastifyError',
      statusCode: 503,
    });
    expect(
      Object.getOwnPropertySymbols(Busy.prototype).map((s) => s.description),
    ).toContain('@karmaniverous/jeeves/deliberate');
  });

  it('passes base and captureStackTrace on to createError', () => {
    const Typed = defineError('ACME_TYPED', 'Typed', 400, {
      base: TypeError,
      captureStackTrace: false,
    });
    const error = new Typed();
    expect(error).toBeInstanceOf(TypeError);
    expect(Object.hasOwn(error, 'stack')).toBe(false);
    expect(isDeliberateError(error)).toBe(true);
  });

  it('accepts your own Error subclass as base (prototype inherited)', () => {
    class AcmeError extends Error {
      get vendor() {
        return 'acme';
      }
    }
    const Mine = defineError('ACME_MINE', 'Mine', 409, { base: AcmeError });
    const error = new Mine();
    expect(error).toBeInstanceOf(AcmeError);
    expect((error as unknown as AcmeError).vendor).toBe('acme');
    expect(isDeliberateError(error)).toBe(true);
  });

  it('accepts any integer status from 400 to 599', () => {
    for (const status of [400, 402, 418, 499, 500, 599] as const) {
      const E = defineError('ACME_ANY', 'Any', status);
      expect(new E().statusCode).toBe(status);
    }
    expectTypeOf<402>().toExtend<HttpErrorStatus>();
    expectTypeOf<499>().toExtend<HttpErrorStatus>();
    expectTypeOf<599>().toExtend<HttpErrorStatus>();
    expectTypeOf<399>().not.toExtend<HttpErrorStatus>();
    expectTypeOf<600>().not.toExtend<HttpErrorStatus>();
    expectTypeOf<200>().not.toExtend<HttpErrorStatus>();
    expectTypeOf<number>().not.toExtend<HttpErrorStatus>();
  });

  it.each([399, 600, 200, 503.5, Number.NaN, '503'])(
    'throws a RangeError at definition for status %s (untyped callers)',
    (status) => {
      expect(() =>
        defineError('ACME_BAD', 'Bad', status as HttpErrorStatus),
      ).toThrow(
        new RangeError(
          `defineError ACME_BAD: status ${String(status)} is not an integer from 400 to 599`,
        ),
      );
    },
  );

  it('a subclass of a defined class is trusted; wrapping one via cause is not', () => {
    const Busy = defineError('ACME_BUSY', 'Busy', 503);
    class StillBusy extends Busy {}
    const sub = new StillBusy();
    expect(sub).toBeInstanceOf(Busy);
    expect(isDeliberateError(sub)).toBe(true);
    expect(isDeliberateError(new Error('wrapper', { cause: new Busy() }))).toBe(
      false,
    );
    expect(isDeliberateError(new AggregateError([new Busy()]))).toBe(false);
  });

  it('leaves createError itself unbranded', () => {
    defineError('ACME_SAME', 'Same', 409);
    const Plain = createError('ACME_SAME', 'Same', 409);
    expect(isDeliberateError(new Plain())).toBe(false);
  });
});

describe('isDeliberateError', () => {
  const brand = Symbol.for('@karmaniverous/jeeves/deliberate');

  it.each([
    ['a foreign object with the Symbol.for brand', { [brand]: true }, true],
    [
      'an object inheriting the brand',
      Object.create({ [brand]: true }) as object,
      true,
    ],
    ['a brand that is not true', { [brand]: 'yes' }, false],
    [
      'a fake brand under a plain string key',
      { '@karmaniverous/jeeves/deliberate': true },
      false,
    ],
    [
      'a same-named local symbol',
      { [Symbol('@karmaniverous/jeeves/deliberate')]: true },
      false,
    ],
    ['a plain Error', new Error('m'), false],
    ['null', null, false],
    ['a string', 'boom', false],
  ])('%s: %j', (_label, value, expected) => {
    expect(isDeliberateError(value)).toBe(expected);
  });
});
