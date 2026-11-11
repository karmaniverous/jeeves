import createError from '@fastify/error';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { testCatalog } from '../test/catalogTestApp.js';
import { defineError } from './defineError.js';
import { registerErrorHandlers } from './errorHandler.js';
import { registerCatalogRoutes } from './registerCatalogRoutes.js';
import { validatorCompiler } from './zodValidation.js';

const ScanInProgress = defineError(
  'WATCHER_SCAN_IN_PROGRESS',
  'A scan is in progress; retry when it finishes',
  503,
);
const JobExists = defineError(
  'RUNNER_JOB_EXISTS',
  'Job %s already exists',
  409,
);

/** The masked 500. */
const MASKED = {
  statusCode: 500,
  error: 'Internal Server Error',
  message: SERVER_ERROR_MESSAGE,
};

/** An app with `registerErrorHandlers` and plain (non-catalog) routes. */
async function buildApp(options?: Parameters<typeof registerErrorHandlers>[1]) {
  const app = Fastify({ logger: false });
  registerErrorHandlers(app, options);
  app.setValidatorCompiler(validatorCompiler);
  app.get('/boom', () => {
    throw Object.assign(new Error('secret detail'), { extra: 'leak?' });
  });
  app.get('/conflict', () => {
    throw new JobExists('j1');
  });
  app.get('/down', () => {
    throw Object.assign(new ScanInProgress(), {
      headers: { 'retry-after': '30', 'set-cookie': 'a=1' },
    });
  });
  app.get('/forgot', () => {
    throw new (createError('ACME_DOWN', 'Store %s down', 503))('db1');
  });
  app.get('/invalid-payload', (_request, reply) => {
    void reply.header('content-type', 'application/octet-stream');
    // Fastify's own 5xx: FST_ERR_REP_INVALID_PAYLOAD_TYPE.
    return reply.send(12345);
  });
  app.post('/n', { schema: { body: z.object({ n: z.number() }) } }, () => ({
    ok: true,
  }));
  await app.ready();
  return app;
}

describe('registerErrorHandlers', () => {
  it('masks a plain Error and logs it through the logger option', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const app = await buildApp({ logger });
    const res = await app.inject('/boom');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(MASKED);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: expect.any(Error) as unknown },
      'Error reply masked',
    );
    await app.close();
  });

  it('keeps a defineError 503: message, code, Retry-After; drops set-cookie; logged once', async () => {
    const logger = { error: vi.fn() };
    const app = await buildApp({ logger });
    const res = await app.inject('/down');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      statusCode: 503,
      code: 'WATCHER_SCAN_IN_PROGRESS',
      error: 'Service Unavailable',
      message: 'A scan is in progress; retry when it finishes',
    });
    expect(res.headers['retry-after']).toBe('30');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: expect.any(Error) as unknown },
      'Error reply',
    );
    await app.close();
  });

  it('keeps a defineError 409', async () => {
    const app = await buildApp();
    const res = await app.inject('/conflict');
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      statusCode: 409,
      code: 'RUNNER_JOB_EXISTS',
      error: 'Conflict',
      message: 'Job j1 already exists',
    });
    await app.close();
  });

  it('the cost of forgetting defineError: a createError 503 becomes a codeless 500', async () => {
    const app = await buildApp({ logger: { error: vi.fn() } });
    const res = await app.inject('/forgot');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(MASKED);
    await app.close();
  });

  it('masks Fastify’s own 5xx', async () => {
    const logger = { error: vi.fn() };
    const app = await buildApp({ logger });
    const res = await app.inject('/invalid-payload');
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(MASKED);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      {
        err: expect.objectContaining({
          code: 'FST_ERR_REP_INVALID_PAYLOAD_TYPE',
          statusCode: 500,
        }) as unknown,
      },
      'Error reply masked',
    );
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

  it('sends Fastify’s invalid-JSON 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/n',
      headers: { 'content-type': 'application/json' },
      payload: '{"n":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_JSON_BODY',
      error: 'Bad Request',
      message:
        "Body is not valid JSON but content-type is set to 'application/json'",
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
    expect(res.json()).toEqual(MASKED);
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged).toEqual([
      expect.objectContaining({
        msg: 'Error reply masked',
        err: expect.objectContaining({ message: 'secret detail' }) as unknown,
      }),
    ]);
    await app.close();
  });

  it('answers every thrown value exactly as a catalog scope does', async () => {
    const thrown: unknown[] = [
      new Error('secret'),
      new JobExists('j1'),
      Object.assign(new ScanInProgress(), {
        headers: { 'retry-after': '30', 'set-cookie': 'a=1', allow: 'GET' },
      }),
      new (createError('ACME_BUSY', 'Busy', 409))(),
      Object.assign(new Error('gone'), {
        status: 404,
        statusCode: 404,
        expose: true,
        headers: { 'set-cookie': 'up=1', 'retry-after': '1' },
      }),
      Object.assign(new Error('m'), { code: 'FST_ERR_X', statusCode: 400 }),
      Object.assign(new Error('m'), { code: 'FST_ERR_X', statusCode: 500 }),
      'boom',
    ];
    const answer = async (app: FastifyInstance, url: string) => {
      const res = await app.inject(url);
      return {
        status: res.statusCode,
        body: res.json<unknown>(),
        headers: {
          'retry-after': res.headers['retry-after'],
          allow: res.headers.allow,
          'set-cookie': res.headers['set-cookie'],
        },
      };
    };
    for (const value of thrown) {
      const plain = Fastify({ logger: false });
      registerErrorHandlers(plain, { logger: { error: vi.fn() } });
      plain.get('/broken', () => Promise.reject(value as Error));
      const scoped = Fastify({ logger: false });
      await registerCatalogRoutes(
        scoped,
        defineCatalog([testCatalog.byName('broken')]),
        { broken: () => Promise.reject(value as Error) },
        { logger: { warn: vi.fn(), error: vi.fn() } },
      );
      expect(await answer(plain, '/broken')).toEqual(
        await answer(scoped, '/broken'),
      );
      await plain.close();
      await scoped.close();
    }
  });
});
