import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  isCatalogValidationError,
  validatorCompiler,
} from './zodValidation.js';

const schema = z.object({ n: z.number().min(2), tags: z.array(z.string()) });
const validate = validatorCompiler({ schema });

describe('validatorCompiler', () => {
  it('returns the parsed value on success', () => {
    expect(validate({ n: 3, tags: ['a'], extra: 1 })).toEqual({
      value: { n: 3, tags: ['a'] },
    });
  });

  it('returns one entry per issue, path as a JSON pointer, rest as params', () => {
    const result = validate({ n: 1, tags: ['a', 2] });
    // Every field but the module-private marker, compared exactly.
    const fields = ('error' in result ? result.error : []).map(
      ({ keyword, instancePath, schemaPath, message, params }) => ({
        keyword,
        instancePath,
        schemaPath,
        message,
        params,
      }),
    );
    expect(fields).toEqual([
      {
        keyword: 'too_small',
        instancePath: '/n',
        schemaPath: '#/n/too_small',
        message: 'Too small: expected number to be >=2',
        params: { origin: 'number', minimum: 2, inclusive: true },
      },
      {
        keyword: 'invalid_type',
        instancePath: '/tags/1',
        schemaPath: '#/tags/1/invalid_type',
        message: 'Invalid input: expected string, received number',
        params: { expected: 'string' },
      },
    ]);
  });

  it('points at the root for a root-level issue', () => {
    const result = validatorCompiler({ schema: z.string() })(1);
    expect('error' in result && result.error[0]?.instancePath).toBe('/');
  });
});

describe('isCatalogValidationError', () => {
  const entries = (validate({}) as { error: unknown[] }).error;

  it('recognises an error carrying its entries', () => {
    expect(
      isCatalogValidationError({
        validation: entries,
        validationContext: 'body',
      }),
    ).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'boom'],
    ['an error without validation', new Error('boom')],
    ['empty validation', { validation: [] }],
    ['another validator’s entries', { validation: [{ keyword: 'type' }] }],
    ['a null entry', { validation: [null] }],
    ['a non-array validation', { validation: entries[0] }],
  ])('rejects %s', (_label, value) => {
    expect(isCatalogValidationError(value)).toBe(false);
  });
});

describe('in a Fastify app without a catalog error handler', () => {
  it("keeps Fastify's default 400 message", async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.post('/x', { schema: { body: schema } }, () => ({ ok: true }));
    const res = await app.inject({
      method: 'POST',
      url: '/x',
      payload: { n: 1, tags: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ message: string }>().message).toBe(
      'body/n Too small: expected number to be >=2',
    );
    await app.close();
  });
});
