import createError from '@fastify/error';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import { registerErrorHandlers } from './errorHandler.js';
import { validatorCompiler } from './zodValidation.js';

/** An app with `registerErrorHandlers` and plain (non-catalog) routes. */
async function buildApp(options?: Parameters<typeof registerErrorHandlers>[1]) {
  const app = Fastify({ logger: false });
  registerErrorHandlers(app, options);
  app.setValidatorCompiler(validatorCompiler);
  app.get('/boom', () => {
    throw Object.assign(new Error('secret detail'), { extra: 'leak?' });
  });
  app.get('/conflict', () => {
    throw new (createError('ACME_BUSY', 'Busy with %s', 409))('j1');
  });
  app.get('/enoent', () => {
    throw Object.assign(new Error('open /etc/secret'), { code: 'ENOENT' });
  });
  app.get('/down', () => {
    throw new (createError('ACME_DOWN', 'Store %s down', 503))('db1');
  });
  app.post('/n', { schema: { body: z.object({ n: z.number() }) } }, () => ({
    ok: true,
  }));
  await app.ready();
  return app;
}

describe('registerErrorHandlers', () => {
  it('masks a 5xx and logs the error through the logger option', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const app = await buildApp({ logger });
    const res = await app.inject('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: SERVER_ERROR_MESSAGE,
    });
    expect(logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) as unknown },
      'Request failed',
    );
    await app.close();
  });

  it('drops the code of a 5xx crash that declares no status', async () => {
    const app = await buildApp({ logger: { error: vi.fn() } });
    const res = await app.inject('/enoent');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: SERVER_ERROR_MESSAGE,
    });
    await app.close();
  });

  it('keeps the code of a 5xx that declares its status', async () => {
    const app = await buildApp({ logger: { error: vi.fn() } });
    const res = await app.inject('/down');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      statusCode: 503,
      code: 'ACME_DOWN',
      error: 'Service Unavailable',
      message: SERVER_ERROR_MESSAGE,
    });
    await app.close();
  });

  it('keeps a 4xx message and code', async () => {
    const app = await buildApp();
    const res = await app.inject('/conflict');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      code: 'ACME_BUSY',
      error: 'Conflict',
      message: 'Busy with j1',
    });
    await app.close();
  });

  it('sends Fastify’s validation 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/n',
      payload: { n: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body/n Invalid input: expected number, received string',
    });
    await app.close();
  });

  it('applies a thrown error’s headers and honours its status', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandlers(app, { logger: { error: vi.fn() } });
    app.get('/x', () => {
      throw Object.assign(new Error('Missing'), {
        status: 404,
        headers: { 'x-a': '1' },
      });
    });
    const res = await app.inject('/x');
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-a']).toBe('1');
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Missing',
    });
    await app.close();
  });

  it('logs through the request logger by default', async () => {
    const lines: string[] = [];
    const app = Fastify({
      logger: {
        level: 'error',
        stream: { write: (l: string) => lines.push(l) },
      },
    });
    registerErrorHandlers(app);
    app.get('/boom', () => {
      throw new Error('secret detail');
    });
    const res = await app.inject('/boom');
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: SERVER_ERROR_MESSAGE,
    });
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged).toEqual([
      expect.objectContaining({
        msg: 'Request failed',
        err: expect.objectContaining({ message: 'secret detail' }) as unknown,
      }),
    ]);
    await app.close();
  });
});
