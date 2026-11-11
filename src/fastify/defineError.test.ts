import createError from '@fastify/error';
import { describe, expect, it } from 'vitest';

import { defineError, isDeliberateError } from './defineError.js';

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
