import { describe, expect, it, vi } from 'vitest';

import { SERVER_ERROR_MESSAGE, statusText } from '../api/errorBody.js';
import { unbuiltErrorBody } from './errorReply.js';

describe('unbuiltErrorBody (Fastify fallback after a failing hook)', () => {
  it.each([
    [399, 500],
    [400, 400],
    [499, 499],
    [500, 500],
    [599, 599],
    [600, 500],
    [503.5, 500],
    ['503', 500],
    [undefined, 500],
  ])('statusCode %s: status %s', (statusCode, status) => {
    const log = { error: vi.fn() };
    const payload = { statusCode, code: 'HOOK', message: 'internal host h' };
    const body = unbuiltErrorBody(payload, log);
    expect(body).toEqual({
      statusCode: status,
      error: statusText(status),
      message: status >= 500 ? SERVER_ERROR_MESSAGE : statusText(status),
    });
    expect(log.error).toHaveBeenCalledExactlyOnceWith(
      { statusCode: status, err: payload },
      'Error reply masked (a hook failed while it was sent)',
    );
  });

  it('exact bodies: a 4xx gets its status text, a 5xx the generic message', () => {
    const log = { error: vi.fn() };
    expect(unbuiltErrorBody({ statusCode: 429 }, log)).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too Many Requests',
    });
    expect(unbuiltErrorBody({ statusCode: 502 }, log)).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: SERVER_ERROR_MESSAGE,
    });
  });

  it('a logger that throws is ignored: the masked body is still returned', () => {
    const log = {
      error: vi.fn(() => {
        throw new Error('logger down');
      }),
    };
    expect(
      unbuiltErrorBody({ statusCode: 502, message: 'internal host h' }, log),
    ).toEqual({
      statusCode: 502,
      error: 'Bad Gateway',
      message: SERVER_ERROR_MESSAGE,
    });
    expect(log.error).toHaveBeenCalledOnce();
  });

  it.each([null, 'boom', 42])('a non-object payload %j: 500', (payload) => {
    const log = { error: vi.fn() };
    expect(unbuiltErrorBody(payload, log)).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: SERVER_ERROR_MESSAGE,
    });
  });
});
