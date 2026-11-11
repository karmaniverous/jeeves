import { Readable } from 'node:stream';

import createError from '@fastify/error';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

import { JEEVES_CONFIG_INVALID } from '../api/configApplyHandler.js';
import { JEEVES_CONFIG_QUERY_INVALID } from '../api/configQuery.js';
import {
  errorBody,
  JEEVES_RESPONSE_VALIDATION,
  SERVER_ERROR_MESSAGE,
} from '../api/errorBody.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { errorBodySchema } from '../catalog/errorBody.js';
import type { CatalogEntry } from '../catalog/types.js';
import { buildOpenApiDocument } from '../openapi/buildOpenApiDocument.js';
import {
  buildTestApp,
  resetTestConfig,
  TEST_BYTES,
  TEST_KEY,
  testCatalog,
  testHandlers,
} from '../test/catalogTestApp.js';
import { defineError } from './defineError.js';
import { registerErrorHandlers } from './errorHandler.js';
import { registerCatalogRoutes } from './registerCatalogRoutes.js';
import { registerOpenApiRoute } from './registerOpenApiRoute.js';
import type {
  CatalogHandlers,
  HandlerResult,
  RegisterCatalogRoutesOptions,
} from './types.js';

/** The strict response-mismatch 500 (spec 5c.4). */
const MISMATCH = {
  statusCode: 500,
  code: JEEVES_RESPONSE_VALIDATION,
  error: 'Internal Server Error',
  message: SERVER_ERROR_MESSAGE,
};

const auth = { authorization: `Bearer ${TEST_KEY}` };

/** A one-entry catalog for focused tests. */
const deleteOnly = defineCatalog([testCatalog.byName('deleteThing')]);

/** Inject an entry's route with a filled-in path. */
const hit = (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  entry: (typeof testCatalog.entries)[number],
) =>
  app.inject({
    method: entry.method,
    url: entry.path.replace(':id', 'k').replace('*', 'p'),
    ...('body' in entry ? { payload: {} } : {}),
  });

describe('registerCatalogRoutes', () => {
  beforeEach(() => {
    resetTestConfig();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes params, coerced query and arrays to the handler', async () => {
    const app = await buildTestApp();
    const one = await app.inject('/things/x?tags=5&verbose=true');
    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual({ id: 'x', tags: [5], verbose: true });
    const many = await app.inject('/things/x?tags=1&tags=2');
    expect(many.json()).toEqual({ id: 'x', tags: [1, 2], verbose: false });
    await app.close();
  });

  it('passes a wildcard path through', async () => {
    const app = await buildTestApp();
    const res = await app.inject('/files/a/b/c.md');
    expect(res.json()).toEqual({ path: 'a/b/c.md' });
    await app.close();
  });

  it('sends the handler status, headers and body', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/things',
      payload: { name: 'n' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.location).toBe('/things/new');
    expect(res.json()).toEqual({ id: 'new', name: 'n' });
    const missing = await app.inject('/things/missing');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      statusCode: 404,
      code: 'ACME_NOT_FOUND',
      error: 'Not Found',
      message: 'Thing missing not found',
    });
    await app.close();
  });

  it('serialised body equals the handler body for complete schemas', async () => {
    const app = await buildTestApp();
    for (const name of ['getThing', 'deleteThing', 'readFile'] as const) {
      const entry = testCatalog.byName(name);
      const url = entry.path.replace(':id', 'k').replace('*', 'p');
      const res = await app.inject({ method: entry.method, url });
      const handlerBody = (
        await testHandlers[name](
          { params: { id: 'k', '*': 'p' }, query: {}, body: {} },
          {} as never,
        )
      ).body;
      expect(res.json()).toEqual(handlerBody);
    }
    await app.close();
  });

  describe('request validation: Fastify 400 (FST_ERR_VALIDATION)', () => {
    it('body and query failures, with Fastify’s message', async () => {
      const app = await buildTestApp();
      const body = await app.inject({
        method: 'POST',
        url: '/things',
        payload: { name: '' },
      });
      expect(body.statusCode).toBe(400);
      expect(body.json()).toEqual({
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        error: 'Bad Request',
        message: 'body/name Too small: expected string to have >=1 characters',
      });
      const query = await app.inject('/things/x?tags=abc');
      expect(query.statusCode).toBe(400);
      expect(query.json()).toEqual({
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        error: 'Bad Request',
        message: 'querystring/tags Invalid input',
      });
      await app.close();
    });

    it('joins several failures with commas', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/things',
        payload: { name: '', size: 'big' },
      });
      expect(res.json()).toEqual({
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        error: 'Bad Request',
        message:
          'body/name Too small: expected string to have >=1 characters, body/size Invalid input: expected number, received string',
      });
      await app.close();
    });

    it('reports a path parameter failure', async () => {
      const app = Fastify({ logger: false });
      await registerCatalogRoutes(
        app,
        defineCatalog([
          {
            name: 'getN',
            method: 'GET',
            path: '/n/:id',
            description: 'Get n.',
            params: z.object({ id: z.string().regex(/^\d+$/) }),
            response: z.object({ ok: z.boolean() }),
            auth: 'none',
            kind: 'read',
          },
        ]),
        { getN: () => Promise.resolve({ status: 200, body: { ok: true } }) },
      );
      const res = await app.inject('/n/abc');
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        error: 'Bad Request',
        message: 'params/id Invalid string: must match pattern /^\\d+$/',
      });
      expect((await app.inject('/n/12')).statusCode).toBe(200);
      await app.close();
    });

    it('registers, validates and answers a PATCH entry', async () => {
      const app = Fastify({ logger: false });
      await registerCatalogRoutes(
        app,
        defineCatalog([
          {
            name: 'setEnabled',
            method: 'PATCH',
            path: '/jobs/:id',
            description: 'Set enabled.',
            params: z.object({ id: z.string() }),
            body: z.object({ enabled: z.boolean() }),
            response: z.object({ id: z.string(), enabled: z.boolean() }),
            auth: 'none',
            kind: 'write',
          },
        ]),
        {
          setEnabled: ({ params, body }) =>
            Promise.resolve({
              status: 200,
              body: { id: params.id, enabled: body.enabled },
            }),
        },
      );
      const bad = await app.inject({
        method: 'PATCH',
        url: '/jobs/j1',
        payload: { enabled: 'yes' },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({
        statusCode: 400,
        code: 'FST_ERR_VALIDATION',
        error: 'Bad Request',
        message:
          'body/enabled Invalid input: expected boolean, received string',
      });
      const good = await app.inject({
        method: 'PATCH',
        url: '/jobs/j1',
        payload: { enabled: false },
      });
      expect(good.statusCode).toBe(200);
      expect(good.json()).toEqual({ id: 'j1', enabled: false });
      // Only PATCH is registered for the path.
      expect(
        (await app.inject({ method: 'PUT', url: '/jobs/j1', payload: {} }))
          .statusCode,
      ).toBe(404);
      await app.close();
    });

    it('answers a malformed JSON body with Fastify’s own error', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/things',
        headers: { 'content-type': 'application/json' },
        payload: '{"name":',
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
  });

  describe('thrown errors: trusted by definition (spec 5c.5, 5d.1)', () => {
    /** An app whose `broken` handler throws `error`. */
    const throwing = async (
      error: unknown,
      options: RegisterCatalogRoutesOptions = {},
      setup: (app: FastifyInstance) => void = () => undefined,
    ) => {
      const app = Fastify({ logger: false });
      setup(app);
      await registerCatalogRoutes(
        app,
        defineCatalog([testCatalog.byName('broken')]),
        // A non-Error rejection is deliberate here.
        { broken: () => Promise.reject(error as Error) },
        options,
      );
      return app;
    };

    /** The masked 500 every untrusted thrown error gets. */
    const MASKED = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: SERVER_ERROR_MESSAGE,
    };

    /** Headers an untrusted error carries; none may reach the client. */
    const LEAKY_HEADERS = {
      'retry-after': '5',
      'www-authenticate': 'Bearer',
      allow: 'GET',
      'set-cookie': 'upstream=secret',
      server: 'qdrant/1.9',
    };

    const brand = Symbol.for('@karmaniverous/jeeves/deliberate');

    describe('defineError errors keep status, code, message, allowlisted headers', () => {
      it("the rate-limit mapping: a plugin hook's errorResponseBuilder returns a defineError 429", async () => {
        // What @fastify/rate-limit does with errorResponseBuilder: set its
        // headers on the reply, then throw what the builder returns.
        const RateLimited = defineError(
          'RATE_LIMITED',
          'Rate limit exceeded, retry in %s',
          429,
        );
        const errorResponseBuilder = (
          _request: unknown,
          context: { after: string },
        ) => new RateLimited(context.after);
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = Fastify({ logger: false });
        app.addHook('onRequest', async (request, reply) => {
          void reply
            .header('retry-after', '60')
            .header('x-ratelimit-limit', '10');
          await Promise.resolve();
          throw errorResponseBuilder(request, { after: '1 minute' });
        });
        await registerCatalogRoutes(
          app,
          defineCatalog([testCatalog.byName('getThing')]),
          testHandlers,
          { logger },
        );
        const res = await app.inject('/things/1');
        expect(res.statusCode).toBe(429);
        expect(res.json()).toEqual({
          statusCode: 429,
          code: 'RATE_LIMITED',
          error: 'Too Many Requests',
          message: 'Rate limit exceeded, retry in 1 minute',
        });
        expect(res.headers['retry-after']).toBe('60');
        expect(res.headers['x-ratelimit-limit']).toBe('10');
        expect(logger.error).not.toHaveBeenCalled();
        await app.close();
      });

      it('a subclass of a defineError class is trusted (the brand is inherited)', async () => {
        const Busy = defineError('ACME_BUSY', 'Busy, retry', 503);
        class StillBusy extends Busy {}
        const app = await throwing(new StillBusy(), {
          logger: { warn: vi.fn(), error: vi.fn() },
        });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({
          statusCode: 503,
          code: 'ACME_BUSY',
          error: 'Service Unavailable',
          message: 'Busy, retry',
        });
        await app.close();
      });

      it('a defineError 409: code and formatted message kept, not logged', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const JobExists = defineError(
          'RUNNER_JOB_EXISTS',
          'Job %s already exists',
          409,
        );
        const app = await throwing(new JobExists('j1'), { logger });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(409);
        expect(res.json()).toEqual({
          statusCode: 409,
          code: 'RUNNER_JOB_EXISTS',
          error: 'Conflict',
          message: 'Job j1 already exists',
        });
        expect(logger.error).not.toHaveBeenCalled();
        await app.close();
      });

      it('a defineError 404: message kept, Retry-After kept, set-cookie dropped', async () => {
        const Missing = defineError(
          'ACME_NOT_FOUND',
          'Thing %s not found',
          404,
        );
        const app = await throwing(
          Object.assign(new Missing('t1'), { headers: LEAKY_HEADERS }),
        );
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({
          statusCode: 404,
          code: 'ACME_NOT_FOUND',
          error: 'Not Found',
          message: 'Thing t1 not found',
        });
        expect(res.headers['retry-after']).toBe('5');
        expect(res.headers['www-authenticate']).toBe('Bearer');
        expect(res.headers.allow).toBe('GET');
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers.server).toBeUndefined();
        await app.close();
      });

      it('a defineError 503: message and Retry-After kept, set-cookie dropped, logged once as kept', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const ScanInProgress = defineError(
          'WATCHER_SCAN_IN_PROGRESS',
          'A scan is in progress; retry when it finishes',
          503,
        );
        const error = Object.assign(new ScanInProgress(), {
          headers: {
            'Retry-After': '30',
            'set-cookie': ['a=1', 'b=2'],
            'x-trace': 't1',
          },
        });
        const app = await throwing(error, { logger });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({
          statusCode: 503,
          code: 'WATCHER_SCAN_IN_PROGRESS',
          error: 'Service Unavailable',
          message: 'A scan is in progress; retry when it finishes',
        });
        expect(res.headers['retry-after']).toBe('30');
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers['x-trace']).toBeUndefined();
        expect(logger.error).toHaveBeenCalledExactlyOnceWith(
          { err: error },
          'Error reply',
        );
        await app.close();
      });

      it('the brand is a Symbol.for key, so an error branded by another copy of core is trusted', async () => {
        const foreign = {
          [brand]: true,
          statusCode: 503,
          code: 'OTHER_COPY_BUSY',
          message: 'Busy',
          headers: { 'retry-after': '9', 'set-cookie': 'x=1' },
        };
        const app = await throwing(foreign, {
          logger: { warn: vi.fn(), error: vi.fn() },
        });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({
          statusCode: 503,
          code: 'OTHER_COPY_BUSY',
          error: 'Service Unavailable',
          message: 'Busy',
        });
        expect(res.headers['retry-after']).toBe('9');
        expect(res.headers['set-cookie']).toBeUndefined();
        await app.close();
      });

      it.each([
        [399, 500, 'Internal Server Error'],
        [400, 400, 'Bad Request'],
        [499, 499, 'Error'],
        [500, 500, 'Internal Server Error'],
        [599, 599, 'Error'],
        [600, 500, 'Internal Server Error'],
        [200, 500, 'Internal Server Error'],
        [503.5, 500, 'Internal Server Error'],
        ['503', 500, 'Internal Server Error'],
        [undefined, 500, 'Internal Server Error'],
      ])(
        'a branded statusCode %j answers %i, message and code kept',
        async (statusCode, status, error) => {
          const app = await throwing(
            { [brand]: true, statusCode, code: 'C', message: 'm' },
            { logger: { warn: vi.fn(), error: vi.fn() } },
          );
          const res = await app.inject('/broken');
          expect(res.statusCode).toBe(status);
          expect(res.json()).toEqual({
            statusCode: status,
            code: 'C',
            error,
            message: 'm',
          });
          await app.close();
        },
      );

      it('a branded error without a string message or code: empty message, no code', async () => {
        const app = await throwing({
          [brand]: true,
          statusCode: 404,
          message: 42,
          code: 7,
        });
        const res = await app.inject('/broken');
        expect(res.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: '',
        });
        await app.close();
      });

      it('allowlisted headers are validated: bad values skipped, body headers never set, odd headers ignored', async () => {
        const Busy = defineError('ACME_BUSY', 'Busy', 503);
        const app = await throwing(
          Object.assign(new Busy(), {
            headers: {
              'retry-after': 'a\r\nset-cookie: evil=1',
              ALLOW: ['GET', 'HEAD'],
              'www-authenticate': { a: 1 },
              'content-type': 'text/plain',
            },
          }),
          { logger: { warn: vi.fn(), error: vi.fn() } },
        );
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(503);
        expect(res.headers['retry-after']).toBeUndefined();
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers.allow).toEqual(['GET', 'HEAD']);
        expect(res.headers['www-authenticate']).toBeUndefined();
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        await app.close();
        for (const headers of [null, 'retry-after: 5']) {
          const odd = await throwing(Object.assign(new Busy(), { headers }), {
            logger: { warn: vi.fn(), error: vi.fn() },
          });
          const oddRes = await odd.inject('/broken');
          expect(oddRes.headers['retry-after']).toBeUndefined();
          expect(oddRes.json()).toEqual({
            statusCode: 503,
            code: 'ACME_BUSY',
            error: 'Service Unavailable',
            message: 'Busy',
          });
          await odd.close();
        }
      });

      it('a header Node rejects is skipped and logged at debug; the scope still answers', async () => {
        const lines: string[] = [];
        const app = Fastify({
          logger: {
            level: 'debug',
            stream: { write: (l: string) => lines.push(l) },
          },
        });
        const appHandler = vi.fn();
        app.setErrorHandler(appHandler);
        const Down = defineError('ACME_DOWN', 'Down for maintenance', 503);
        await registerCatalogRoutes(
          app,
          defineCatalog([testCatalog.byName('broken')]),
          {
            broken: () =>
              Promise.reject(
                Object.assign(new Down(), {
                  headers: {
                    'retry-after': 'a\r\nset-cookie: evil=1',
                    Allow: 'GET',
                  },
                }),
              ),
          },
          { logger: { warn: vi.fn(), error: vi.fn() } },
        );
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(503);
        expect(res.headers['retry-after']).toBeUndefined();
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers.allow).toBe('GET');
        expect(appHandler).not.toHaveBeenCalled();
        const skipped = lines
          .map((l) => JSON.parse(l) as Record<string, unknown>)
          .filter((l) => l.msg === 'Error header skipped')
          .map((l) => l.header);
        expect(skipped).toEqual(['retry-after']);
        await app.close();
      });
    });

    describe('every other thrown error: masked 500, no code, no headers, logged', () => {
      it('the cost of forgetting defineError: a createError 503 becomes a codeless 500', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const ScanInProgress = createError(
          'WATCHER_SCAN_IN_PROGRESS',
          'A scan is in progress; retry when it finishes',
          503,
        );
        const error = Object.assign(new ScanInProgress(), {
          headers: { 'retry-after': '30' },
        });
        const app = await throwing(error, { logger });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual(MASKED);
        expect(res.headers['retry-after']).toBeUndefined();
        expect(logger.error).toHaveBeenCalledExactlyOnceWith(
          { err: error },
          'Error reply masked',
        );
        await app.close();
      });

      /** An Elasticsearch-style error: `statusCode` is a getter. */
      class ElasticLikeError extends Error {
        readonly meta = { statusCode: 503, headers: LEAKY_HEADERS };
        get statusCode() {
          return this.meta.statusCode;
        }
        get headers() {
          return this.meta.headers;
        }
      }

      it.each([
        [
          'a plain Error with an enumerable field',
          Object.assign(new Error('secret detail'), { extra: 'leak?' }),
        ],
        [
          'a plain createError 409',
          new (createError('RUNNER_JOB_EXISTS', 'Job %s already exists', 409))(
            'j1',
          ),
        ],
        [
          'a plain createError at its default 500',
          new (createError('ACME_DB', 'pg at %s refused'))('10.0.0.5:5432'),
        ],
        [
          'an http-errors-like 404 (expose: true)',
          Object.assign(new Error('User u1 not found'), {
            statusCode: 404,
            status: 404,
            expose: true,
            headers: LEAKY_HEADERS,
          }),
        ],
        [
          'an http-errors-like 500 (expose: false)',
          Object.assign(new Error('password authentication failed'), {
            statusCode: 500,
            status: 500,
            expose: false,
            code: 'EAUTH',
          }),
        ],
        [
          'a status-only 404 (axios, Qdrant ApiError)',
          Object.assign(new Error('Request failed with status code 404'), {
            status: 404,
            code: 'ERR_BAD_REQUEST',
          }),
        ],
        [
          'a status-only 503',
          Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:6333'), {
            status: 503,
            code: 'ECONNREFUSED',
          }),
        ],
        [
          'an undici ResponseStatusCodeError-shaped 404 with set-cookie',
          Object.assign(new Error('Response status code 404: Not Found'), {
            name: 'ResponseStatusCodeError',
            code: 'UND_ERR_RESPONSE_STATUS_CODE',
            status: 404,
            statusCode: 404,
            headers: LEAKY_HEADERS,
            body: { status: { error: 'Collection acme missing' } },
          }),
        ],
        [
          'an AWS SDK-shaped 503',
          Object.assign(
            new Error(
              'Rate exceeded for arn:aws:dynamodb:us-east-1:123456789012:table/acme',
            ),
            {
              statusCode: 503,
              code: 'ThrottlingException',
              $metadata: { httpStatusCode: 503 },
            },
          ),
        ],
        [
          'an Elasticsearch-shaped 503 (statusCode getter)',
          new ElasticLikeError(
            'index_not_found_exception host https://es.internal:9200',
          ),
        ],
        [
          'an ENOENT crash',
          Object.assign(new Error("ENOENT: open '/etc/secret'"), {
            code: 'ENOENT',
          }),
        ],
        [
          "Fastify's own 5xx",
          Object.assign(
            new Error('Attempted to send payload of invalid type'),
            {
              code: 'FST_ERR_REP_INVALID_PAYLOAD_TYPE',
              statusCode: 500,
            },
          ),
        ],
        [
          'an FST_ERR_ code below 400',
          Object.assign(new Error('m'), { code: 'FST_ERR_X', statusCode: 399 }),
        ],
        [
          'an FST_ERR_ code with a status-only 400',
          Object.assign(new Error('m'), { code: 'FST_ERR_X', status: 400 }),
        ],
        [
          'a code like FST_ERR without the underscore',
          Object.assign(new Error('m'), { code: 'FST_ERRX', statusCode: 400 }),
        ],
        [
          'a lower-case fst_err_ code',
          Object.assign(new Error('m'), { code: 'fst_err_x', statusCode: 400 }),
        ],
        ['a string', 'boom'],
        ['null', null],
        ['a non-string code and message', { code: 7, message: { a: 1 } }],
        [
          'a fake brand under a plain string key',
          Object.assign(new Error('forged internal'), {
            statusCode: 503,
            code: 'FORGED',
            '@karmaniverous/jeeves/deliberate': true,
          }),
        ],
        [
          'an error wrapping a defineError one via cause (cause is not followed)',
          new Error('wrapper internal', {
            cause: new (defineError('ACME_BUSY', 'Busy', 503))(),
          }),
        ],
      ])('%s', async (_label, thrown) => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await throwing(thrown, { logger });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual(MASKED);
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        for (const name of Object.keys(LEAKY_HEADERS))
          expect(res.headers[name]).toBeUndefined();
        expect(logger.error).toHaveBeenCalledExactlyOnceWith(
          { err: thrown },
          'Error reply masked',
        );
        await app.close();
      });

      it('headers already on the reply are left alone', async () => {
        const app = await throwing(new Error('boom'), {}, (root) => {
          root.addHook('onRequest', async (_request, reply) => {
            void reply.header('x-trace', 't1');
            await Promise.resolve();
          });
        });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(500);
        expect(res.headers['x-trace']).toBe('t1');
        expect(res.json()).toEqual(MASKED);
        await app.close();
      });
    });

    describe("Fastify's own 4xx errors are trusted", () => {
      it('a hand-made FST_ERR_ 4xx keeps status, code and message', async () => {
        const app = await throwing(
          Object.assign(new Error('Unsupported thing'), {
            code: 'FST_ERR_X',
            statusCode: 499,
          }),
        );
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(499);
        expect(res.json()).toEqual({
          statusCode: 499,
          code: 'FST_ERR_X',
          error: 'Error',
          message: 'Unsupported thing',
        });
        await app.close();
      });

      it('an oversized body: Fastify’s 413', async () => {
        const app = Fastify({ logger: false, bodyLimit: 16 });
        await registerCatalogRoutes(
          app,
          defineCatalog([testCatalog.byName('createThing')]),
          testHandlers,
        );
        const res = await app.inject({
          method: 'POST',
          url: '/things',
          payload: { name: 'x'.repeat(64) },
        });
        expect(res.statusCode).toBe(413);
        expect(res.json()).toEqual({
          statusCode: 413,
          code: 'FST_ERR_CTP_BODY_TOO_LARGE',
          error: 'Payload Too Large',
          message: 'Request body is too large',
        });
        await app.close();
      });

      it('an unsupported media type: Fastify’s 415', async () => {
        const app = await buildTestApp();
        const res = await app.inject({
          method: 'POST',
          url: '/things',
          headers: { 'content-type': 'application/xml' },
          payload: '<name>n</name>',
        });
        expect(res.statusCode).toBe(415);
        expect(res.json()).toEqual({
          statusCode: 415,
          code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
          error: 'Unsupported Media Type',
          message: 'Unsupported Media Type',
        });
        await app.close();
      });
    });

    it('never consults the app’s error handler', async () => {
      const appHandler = vi.fn();
      const app = await throwing(new Error('boom'), {}, (root) => {
        root.setErrorHandler(appHandler);
      });
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual(MASKED);
      expect(appHandler).not.toHaveBeenCalled();
      await app.close();
    });

    it('answers an unknown route in Fastify’s body', async () => {
      const app = await throwing(new Error('unused'));
      const res = await app.inject('/nowhere');
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Route GET:/nowhere not found',
      });
      await app.close();
    });
  });

  describe('error results: normalised to Fastify’s body', () => {
    /** An app whose `deleteThing` handler returns `result`. */
    const returning = async (
      result: HandlerResult<CatalogEntry>,
      options: RegisterCatalogRoutesOptions = {},
    ) => {
      const app = Fastify({ logger: false });
      await registerCatalogRoutes(
        app,
        deleteOnly,
        { deleteThing: () => Promise.resolve(result as never) },
        options,
      );
      return app;
    };

    it('a 4xx keeps its message and code, drops other fields', async () => {
      const app = await returning({
        status: 409,
        body: { message: 'Busy', code: 'ACME_BUSY', extra: 1 } as never,
        headers: { 'retry-after': '5' },
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(409);
      expect(res.headers['retry-after']).toBe('5');
      expect(res.json()).toEqual({
        statusCode: 409,
        code: 'ACME_BUSY',
        error: 'Conflict',
        message: 'Busy',
      });
      await app.close();
    });

    it('a full ErrorBody takes its statusCode and error text from the status', async () => {
      const app = await returning({
        status: 404,
        body: errorBody(500, 'No thing 1', 'ACME_NOT_FOUND'),
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.json()).toEqual({
        statusCode: 404,
        code: 'ACME_NOT_FOUND',
        error: 'Not Found',
        message: 'No thing 1',
      });
      await app.close();
    });

    it('a 5xx is deliberate: code and message kept, logged', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const app = await returning(
        {
          status: 503,
          body: {
            message: 'Embedding service unavailable; retry shortly',
            code: 'WATCHER_EMBEDDING_UNAVAILABLE',
          },
        },
        { logger },
      );
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        statusCode: 503,
        code: 'WATCHER_EMBEDDING_UNAVAILABLE',
        error: 'Service Unavailable',
        message: 'Embedding service unavailable; retry shortly',
      });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        {
          statusCode: 503,
          code: 'WATCHER_EMBEDDING_UNAVAILABLE',
          message: 'Embedding service unavailable; retry shortly',
        },
        'Error reply',
      );
      await app.close();
    });

    it('a 5xx logs through the request logger by default', async () => {
      const lines: string[] = [];
      const app = Fastify({
        logger: {
          level: 'error',
          stream: { write: (l: string) => lines.push(l) },
        },
      });
      await registerCatalogRoutes(app, deleteOnly, {
        deleteThing: () =>
          Promise.resolve({
            status: 503 as const,
            body: { message: 'Busy, retry later' },
          }),
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.json()).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Busy, retry later',
      });
      const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(logged).toEqual([
        expect.objectContaining({
          msg: 'Error reply',
          statusCode: 503,
          message: 'Busy, retry later',
        }),
      ]);
      await app.close();
    });

    it('a content-type header is ignored: an error body is always JSON', async () => {
      const app = await returning({
        status: 404,
        body: { message: 'gone' },
        headers: { 'content-type': 'text/plain', 'x-trace': 't1' },
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['x-trace']).toBe('t1');
      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'gone',
      });
      await app.close();
    });

    it('a header echoing a CRLF path parameter is skipped, not fatal', async () => {
      const appHandler = vi.fn();
      const app = Fastify({ logger: false });
      app.setErrorHandler(appHandler);
      await registerCatalogRoutes(app, deleteOnly, {
        deleteThing: ({ params }) =>
          Promise.resolve({
            status: 404 as const,
            body: { message: 'No such thing' },
            headers: { 'x-id': params.id },
          }),
      });
      const res = await app.inject({
        method: 'DELETE',
        url: '/things/a%0D%0Aset-cookie:%20evil=1',
      });
      expect(res.statusCode).toBe(404);
      expect(res.headers['x-id']).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'No such thing',
      });
      expect(appHandler).not.toHaveBeenCalled();
      await app.close();
    });

    it('a 400 is normalised too', async () => {
      const app = await returning({
        status: 400,
        body: { message: 'Bad id', code: 'ACME_BAD_ID', extra: 1 } as never,
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        statusCode: 400,
        code: 'ACME_BAD_ID',
        error: 'Bad Request',
        message: 'Bad id',
      });
      await app.close();
    });

    it('a 500 without a code has none; its message is kept', async () => {
      const app = await returning({ status: 500, body: { message: 'x' } });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'x',
      });
      await app.close();
    });

    it('a 4xx with no message is a response mismatch', async () => {
      const app = await returning({ status: 404, body: {} as never });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual(MISMATCH);
      await app.close();
    });
  });

  it('rejects, not crashes, when a route cannot be registered', async () => {
    const app = Fastify({ logger: false });
    app.get('/broken', () => 'taken');
    const catalog = defineCatalog([testCatalog.byName('broken')]);
    await expect(
      registerCatalogRoutes(app, catalog, {
        broken: () => Promise.reject(new Error('boom')),
      }),
    ).rejects.toThrow(/already declared/);
    await app.close().catch(() => undefined);
  });

  describe('response validation', () => {
    it('strict (default): logs at error and replies 500', async () => {
      const app = await buildTestApp();
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual(MISMATCH);
      await app.close();
    });

    it('strict mismatch never reaches the app error handler', async () => {
      const app = Fastify({ logger: false });
      const appHandler = vi.fn();
      app.setErrorHandler(appHandler);
      await registerCatalogRoutes(app, testCatalog, testHandlers);
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual(MISMATCH);
      expect(appHandler).not.toHaveBeenCalled();
      await app.close();
    });

    it('logs mismatches through the logger option when Fastify logging is off', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const strict = await buildTestApp({ logger });
      await strict.inject('/broken');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ issues: expect.any(Array) as unknown }),
        'Response validation failed',
      );
      await strict.close();
      const log = await buildTestApp({ responseValidation: 'log', logger });
      await log.inject('/broken');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/broken', httpStatus: '2xx' }),
        'Response validation failed (log mode): sent unparsed',
      );
      await log.close();
    });

    it('log: warns and sends the handler body unparsed', async () => {
      const app = await buildTestApp({ responseValidation: 'log' });
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ count: 'many' });
      await app.close();
    });

    it('strips unnamed keys from matching responses', async () => {
      const app = Fastify({ logger: false });
      await registerCatalogRoutes(app, deleteOnly, {
        deleteThing: () =>
          Promise.resolve({
            status: 200,
            body: { deleted: true, extra: 1 } as { deleted: boolean },
          }),
      });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.json()).toEqual({ deleted: true });
      await app.close();
    });

    describe('replies sent from a root hook: rebuilt from the status', () => {
      /** An app whose root hook answers `/things/:id` itself. */
      const hooked = async (
        hook: (reply: FastifyReply) => Promise<unknown>,
        options: RegisterCatalogRoutesOptions = {},
        name: 'onRequest' | 'preHandler' = 'onRequest',
      ) => {
        const app = Fastify({ logger: false });
        app.addHook(name, async (_request, reply) => {
          await hook(reply);
        });
        await registerCatalogRoutes(app, deleteOnly, testHandlers, options);
        return app;
      };
      const del = (app: FastifyInstance) =>
        app.inject({ method: 'DELETE', url: '/things/1' });

      it.each(['onRequest', 'preHandler'] as const)(
        '%s: an errorBody 401 goes out as sent',
        async (name) => {
          const app = await hooked(
            async (reply) =>
              reply.status(401).send(errorBody(401, 'Missing key', 'ACME_KEY')),
            {},
            name,
          );
          const res = await del(app);
          expect(res.statusCode).toBe(401);
          expect(res.json()).toEqual({
            statusCode: 401,
            code: 'ACME_KEY',
            error: 'Unauthorized',
            message: 'Missing key',
          });
          await app.close();
        },
      );

      it('statusCode and error come from the reply status; extra fields drop', async () => {
        const app = await hooked(async (reply) =>
          reply
            .status(401)
            .send({ ...errorBody(403, 'x'), code: 7, stack: 'secret' }),
        );
        const res = await del(app);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'x',
        });
        await app.close();
      });

      it.each(['strict', 'log'] as const)(
        '%s: a 503 errorBody is deliberate: message kept and logged',
        async (responseValidation) => {
          const logger = { warn: vi.fn(), error: vi.fn() };
          const app = await hooked(
            async (reply) =>
              reply
                .status(503)
                .send(
                  errorBody(503, 'Auth service unavailable', 'ACME_AUTH_DOWN'),
                ),
            { responseValidation, logger },
          );
          const res = await del(app);
          expect(res.statusCode).toBe(503);
          expect(res.json()).toEqual({
            statusCode: 503,
            code: 'ACME_AUTH_DOWN',
            error: 'Service Unavailable',
            message: 'Auth service unavailable',
          });
          expect(logger.error).toHaveBeenCalledWith(
            {
              statusCode: 503,
              code: 'ACME_AUTH_DOWN',
              message: 'Auth service unavailable',
            },
            'Error reply',
          );
          await app.close();
        },
      );

      it('strict: a body without a string message is a mismatch', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await hooked(
          async (reply) => reply.status(401).send({ error: 'Unauthorized' }),
          { logger },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual(MISMATCH);
        expect(logger.error).toHaveBeenCalledWith(
          {
            issues: [expect.objectContaining({ path: ['message'] }) as unknown],
          },
          'Response validation failed',
        );
        await app.close();
      });

      it('log: a body without a string message gets the generic one, with a warning', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await hooked(
          async (reply) =>
            reply.status(401).send({ error: 'Unauthorized', code: 'ACME_KEY' }),
          { responseValidation: 'log', logger },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          statusCode: 401,
          code: 'ACME_KEY',
          error: 'Unauthorized',
          message: 'Unauthorized',
        });
        expect(logger.warn).toHaveBeenCalledWith(
          {
            statusCode: 401,
            issues: [expect.objectContaining({ path: ['message'] }) as unknown],
          },
          'Error body has no message (log mode): sent with the generic one',
        );
        expect(logger.error).not.toHaveBeenCalled();
        await app.close();
      });

      it('log: a 5xx without a message, or a null body, is masked too', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await hooked(
          async (reply) =>
            reply.status(503).send({ error: 'x', stack: 'secret' }),
          { responseValidation: 'log', logger },
        );
        const res = await del(app);
        expect(res.json()).toEqual({
          statusCode: 503,
          error: 'Service Unavailable',
          message: SERVER_ERROR_MESSAGE,
        });
        // The replaced body is logged with the warning.
        expect(logger.warn).toHaveBeenCalledWith(
          {
            statusCode: 503,
            issues: [expect.objectContaining({ path: ['message'] }) as unknown],
            body: { error: 'x', stack: 'secret' },
          },
          'Error body has no message (log mode): sent with the generic one',
        );
        await app.close();
        const nul = await hooked(
          async (reply) => reply.status(418).send(null),
          {
            responseValidation: 'log',
          },
        );
        expect((await del(nul)).json()).toEqual({
          statusCode: 418,
          error: "I'm a Teapot",
          message: "I'm a Teapot",
        });
        await nul.close();
      });

      it('a string 4xx keeps its text as the message, as JSON', async () => {
        const app = await hooked(async (reply) =>
          reply.status(401).send('Missing key'),
        );
        const res = await del(app);
        expect(res.statusCode).toBe(401);
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        expect(res.json()).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing key',
        });
        await app.close();
      });

      it('a string or Buffer 5xx is masked and its text logged', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await hooked(
          async (reply) => reply.status(503).send('db at 10.0.0.5 down'),
          { logger },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({
          statusCode: 503,
          error: 'Service Unavailable',
          message: SERVER_ERROR_MESSAGE,
        });
        expect(logger.error).toHaveBeenCalledWith(
          { statusCode: 503, code: undefined, message: 'db at 10.0.0.5 down' },
          'Error reply masked',
        );
        await app.close();
        const bytes = await hooked(
          async (reply) => reply.status(500).send(Buffer.from('secret bytes')),
          { logger },
        );
        expect((await del(bytes)).json()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          message: SERVER_ERROR_MESSAGE,
        });
        expect(logger.error).toHaveBeenLastCalledWith(
          { statusCode: 500, code: undefined, message: 'secret bytes' },
          'Error reply masked',
        );
        await bytes.close();
      });

      it.each([
        ['string', (body: string) => body],
        ['Buffer', (body: string) => Buffer.from(body)],
      ])(
        'JSON text (%s) is parsed and normalised like an object',
        async (_label, wrap) => {
          const app = await hooked(async (reply) =>
            reply
              .status(401)
              .type('application/json')
              .send(wrap(JSON.stringify(errorBody(401, 'Nope', 'ACME_NOPE')))),
          );
          const res = await del(app);
          expect(res.statusCode).toBe(401);
          expect(res.headers['content-type']).toBe(
            'application/json; charset=utf-8',
          );
          expect(res.json()).toEqual({
            statusCode: 401,
            code: 'ACME_NOPE',
            error: 'Unauthorized',
            message: 'Nope',
          });
          await app.close();
        },
      );

      it('JSON text: statusCode from the reply, 5xx message kept and logged', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const app = await hooked(
          async (reply) =>
            reply
              .status(503)
              .type('application/problem+json')
              .send(
                JSON.stringify({
                  statusCode: 400,
                  code: 'ACME_DOWN',
                  message: 'Store offline',
                  stack: 'secret',
                }),
              ),
          { logger },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({
          statusCode: 503,
          code: 'ACME_DOWN',
          error: 'Service Unavailable',
          message: 'Store offline',
        });
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          { statusCode: 503, code: 'ACME_DOWN', message: 'Store offline' },
          'Error reply',
        );
        await app.close();
      });

      it('JSON text without a message: strict mismatch, log mode status text', async () => {
        const send = async (reply: FastifyReply) =>
          reply
            .status(401)
            .type('application/json')
            .send('{"error":"Unauthorized","code":"ACME_KEY"}');
        const logger = { warn: vi.fn(), error: vi.fn() };
        const strict = await hooked(send, { logger });
        const res = await del(strict);
        expect(res.statusCode).toBe(500);
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        expect(res.json()).toEqual(MISMATCH);
        expect(logger.error).toHaveBeenCalledWith(
          {
            issues: [expect.objectContaining({ path: ['message'] }) as unknown],
          },
          'Response validation failed',
        );
        await strict.close();
        const log = await hooked(send, { responseValidation: 'log' });
        expect((await del(log)).json()).toEqual({
          statusCode: 401,
          code: 'ACME_KEY',
          error: 'Unauthorized',
          message: 'Unauthorized',
        });
        await log.close();
      });

      it('unparseable JSON text is the message', async () => {
        const app = await hooked(async (reply) =>
          reply.status(400).type('application/json').send('{not json'),
        );
        expect((await del(app)).json()).toEqual({
          statusCode: 400,
          error: 'Bad Request',
          message: '{not json',
        });
        await app.close();
      });

      it('a string 5xx logs through the request logger by default', async () => {
        const lines: string[] = [];
        const app = Fastify({
          logger: {
            level: 'error',
            stream: { write: (l: string) => lines.push(l) },
          },
        });
        app.addHook('onRequest', async (_request, reply) => {
          await reply.status(502).send('upstream 10.0.0.9 refused');
        });
        await registerCatalogRoutes(app, deleteOnly, testHandlers);
        expect((await del(app)).json()).toEqual({
          statusCode: 502,
          error: 'Bad Gateway',
          message: SERVER_ERROR_MESSAGE,
        });
        const logged = lines.map(
          (l) => JSON.parse(l) as Record<string, unknown>,
        );
        expect(logged).toEqual([
          expect.objectContaining({
            msg: 'Error reply masked',
            statusCode: 502,
            message: 'upstream 10.0.0.9 refused',
          }),
        ]);
        await app.close();
      });

      it('a string 400 is replaced too', async () => {
        const app = await hooked(async (reply) =>
          reply.status(400).send('Bad'),
        );
        expect((await del(app)).json()).toEqual({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Bad',
        });
        await app.close();
        // JSON-looking text without a JSON type is text, not parsed.
        const plain = await hooked(async (reply) =>
          reply.status(400).send('{"message":"x"}'),
        );
        expect((await del(plain)).json()).toEqual({
          statusCode: 400,
          error: 'Bad Request',
          message: '{"message":"x"}',
        });
        await plain.close();
      });

      describe("a hook that throws on the error reply: Fastify's fallback is masked", () => {
        /** What the failing hook throws: internal text, a status and a code. */
        const hookError = (statusCode: number, code: string) =>
          Object.assign(new Error(`${code} internal host db.internal`), {
            statusCode,
            code,
          });

        it('a root onSend that always throws: standard body, nothing of the hook error', async () => {
          const logger = { warn: vi.fn(), error: vi.fn() };
          const app = Fastify({ logger: false });
          app.addHook('onSend', () => Promise.reject(hookError(502, 'ONSEND')));
          await registerCatalogRoutes(
            app,
            defineCatalog([testCatalog.byName('getThing')]),
            testHandlers,
            { logger },
          );
          const res = await app.inject('/things/1');
          expect(res.statusCode).toBe(502);
          expect(res.json()).toEqual({
            statusCode: 502,
            error: 'Bad Gateway',
            message: SERVER_ERROR_MESSAGE,
          });
          expect(res.body).not.toMatch(/internal|ONSEND/);
          expect(logger.error).toHaveBeenLastCalledWith(
            {
              statusCode: 502,
              err: expect.objectContaining({
                message: 'ONSEND internal host db.internal',
              }) as unknown,
            },
            'Error reply masked (a hook failed while it was sent)',
          );
          await app.close();
        });

        it('a root onSend that throws on error replies, with registerErrorHandlers', async () => {
          const app = Fastify({ logger: false });
          registerErrorHandlers(app, { logger: { error: vi.fn() } });
          app.addHook('onSend', async (_request, reply, payload) => {
            if (reply.statusCode >= 400) throw hookError(502, 'ONSEND');
            return payload;
          });
          await registerCatalogRoutes(
            app,
            defineCatalog([testCatalog.byName('broken')]),
            { broken: () => Promise.reject(new Error('boom')) },
            { logger: { warn: vi.fn(), error: vi.fn() } },
          );
          // Ours masks twice, then Fastify's default handler takes the
          // hook error's status before the fallback serializes it.
          const res = await app.inject('/broken');
          expect(res.statusCode).toBe(502);
          expect(res.json()).toEqual({
            statusCode: 502,
            error: 'Bad Gateway',
            message: SERVER_ERROR_MESSAGE,
          });
          expect(res.body).not.toMatch(/internal|ONSEND|boom/);
          await app.close();
        });

        it('a root preSerialization that always throws: a 4xx gets its status text, no code', async () => {
          const logger = { warn: vi.fn(), error: vi.fn() };
          const app = Fastify({ logger: false });
          app.addHook('preSerialization', () =>
            Promise.reject(hookError(400, 'PRESER')),
          );
          await registerCatalogRoutes(
            app,
            defineCatalog([testCatalog.byName('getThing')]),
            testHandlers,
            { logger },
          );
          const res = await app.inject('/things/1');
          expect(res.statusCode).toBe(400);
          expect(res.json()).toEqual({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Bad Request',
          });
          expect(res.body).not.toMatch(/internal|PRESER/);
          expect(logger.error).toHaveBeenLastCalledWith(
            {
              statusCode: 400,
              err: expect.objectContaining({
                message: 'PRESER internal host db.internal',
              }) as unknown,
            },
            'Error reply masked (a hook failed while it was sent)',
          );
          await app.close();
        });
      });

      it('a 2xx a root onSend turns into an error is still replaced', async () => {
        const app = Fastify({ logger: false });
        app.addHook('onSend', async (_request, reply) => {
          void reply.status(500);
          return 'onSend secret';
        });
        await registerCatalogRoutes(
          app,
          defineCatalog([testCatalog.byName('getThing')]),
          testHandlers,
        );
        const res = await app.inject('/things/1');
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          message: SERVER_ERROR_MESSAGE,
        });
        await app.close();
      });

      it('an object sent with a non-JSON type is replaced too', async () => {
        const app = await hooked(async (reply) =>
          reply.status(404).type('text/plain').send({ message: 'gone' }),
        );
        const res = await del(app);
        expect(res.statusCode).toBe(404);
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        expect(res.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: 'Not Found',
        });
        await app.close();
      });

      it('an empty 4xx or a 5xx stream gets the standard body', async () => {
        const empty = await hooked(async (reply) => reply.status(401).send());
        expect((await del(empty)).json()).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Unauthorized',
        });
        await empty.close();
        const stream = Readable.from(['secret']);
        const streamed = await hooked(async (reply) =>
          reply.status(500).send(stream),
        );
        expect((await del(streamed)).json()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          message: SERVER_ERROR_MESSAGE,
        });
        expect(stream.destroyed).toBe(true);
        await streamed.close();
      });

      it('a web ReadableStream under an error status is cancelled', async () => {
        const cancel = vi.fn();
        const app = await hooked(async (reply) =>
          reply.status(500).send(
            new ReadableStream({
              pull: (controller) => {
                controller.enqueue(new TextEncoder().encode('secret'));
              },
              cancel,
            }),
          ),
        );
        expect((await del(app)).json()).toEqual({
          statusCode: 500,
          error: 'Internal Server Error',
          message: SERVER_ERROR_MESSAGE,
        });
        expect(cancel).toHaveBeenCalledTimes(1);
        await app.close();
        // A locked stream can't be cancelled; the rejection is swallowed.
        const locked = new ReadableStream();
        locked.getReader();
        const lockedApp = await hooked(async (reply) =>
          reply.status(500).send(locked),
        );
        expect((await del(lockedApp)).statusCode).toBe(500);
        await lockedApp.close();
      });

      it('a web Response with an error status is replaced, its body cancelled', async () => {
        const logger = { warn: vi.fn(), error: vi.fn() };
        const cancel = vi.fn();
        const app = await hooked(
          async (reply) =>
            reply.send(
              new Response(
                new ReadableStream({
                  start: (controller) => {
                    controller.enqueue(
                      new TextEncoder().encode('db secret 10.0.0.5'),
                    );
                  },
                  cancel,
                }),
                { status: 503, headers: { 'content-type': 'text/plain' } },
              ),
            ),
          { logger },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(503);
        expect(res.headers['content-type']).toBe(
          'application/json; charset=utf-8',
        );
        expect(res.json()).toEqual({
          statusCode: 503,
          error: 'Service Unavailable',
          message: SERVER_ERROR_MESSAGE,
        });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
          {
            statusCode: 503,
            code: undefined,
            message: 'Service Unavailable',
          },
          'Error reply masked',
        );
        await app.close();
        const bodiless = await hooked(async (reply) =>
          reply.send(new Response(null, { status: 404 })),
        );
        const gone = await del(bodiless);
        expect(gone.statusCode).toBe(404);
        expect(gone.json()).toEqual({
          statusCode: 404,
          error: 'Not Found',
          message: 'Not Found',
        });
        await bodiless.close();
      });

      it('a web Response with a 2xx status is left alone', async () => {
        const app = await hooked(async (reply) =>
          reply.status(500).send(new Response('fine', { status: 200 })),
        );
        const res = await del(app);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('fine');
        await app.close();
      });

      it('a status without standard text gets error and message "Error"', async () => {
        const unknown = { statusCode: 499, error: 'Error', message: 'Error' };
        const empty = await hooked(async (reply) => reply.status(499).send());
        expect((await del(empty)).json()).toEqual(unknown);
        await empty.close();
        const log = await hooked(async (reply) => reply.status(499).send({}), {
          responseValidation: 'log',
        });
        expect((await del(log)).json()).toEqual(unknown);
        await log.close();
      });

      it('a hook that sets Retry-After and sends an error body: both kept', async () => {
        const app = await hooked(
          async (reply) =>
            reply
              .header('retry-after', '7')
              .header('set-cookie', 'hook=1')
              .status(503)
              .send(errorBody(503, 'Busy, retry soon', 'ACME_BUSY')),
          { logger: { warn: vi.fn(), error: vi.fn() } },
        );
        const res = await del(app);
        expect(res.statusCode).toBe(503);
        expect(res.headers['retry-after']).toBe('7');
        expect(res.headers['set-cookie']).toBe('hook=1');
        expect(res.json()).toEqual({
          statusCode: 503,
          code: 'ACME_BUSY',
          error: 'Service Unavailable',
          message: 'Busy, retry soon',
        });
        await app.close();
      });

      it('a defineError error thrown from the hook is answered by the scope', async () => {
        const Unauthorized = defineError(
          'ACME_UNAUTHORIZED',
          'Missing key',
          401,
        );
        const app = await hooked(() => Promise.reject(new Unauthorized()));
        const res = await del(app);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          statusCode: 401,
          code: 'ACME_UNAUTHORIZED',
          error: 'Unauthorized',
          message: 'Missing key',
        });
        await app.close();
      });

      it('leaves 2xx hook replies alone', async () => {
        const app = await hooked(async (reply) =>
          reply.status(200).send('as is'),
        );
        const res = await del(app);
        expect(res.statusCode).toBe(200);
        expect(res.body).toBe('as is');
        await app.close();
      });
    });
  });

  describe('non-JSON entries', () => {
    /** An app serving `readme` (text/markdown), with a root hook. */
    const textApp = async (
      hook: (reply: FastifyReply) => Promise<unknown>,
      options: RegisterCatalogRoutesOptions = {},
    ) => {
      const app = Fastify({ logger: false });
      app.addHook('onRequest', async (_request, reply) => {
        await hook(reply);
      });
      await registerCatalogRoutes(
        app,
        defineCatalog([testCatalog.byName('readme')]),
        { readme: testHandlers.readme },
        options,
      );
      return app;
    };

    it('use the error body as their 4xx/5xx schema, with no 2xx schema', async () => {
      const app = Fastify({ logger: false });
      const schemas: unknown[] = [];
      app.addHook('onRoute', (route) => {
        if (route.method === 'GET') schemas.push(route.schema?.response);
      });
      await registerCatalogRoutes(
        app,
        defineCatalog([testCatalog.byName('readme')]),
        { readme: testHandlers.readme },
      );
      expect(schemas).toEqual([
        { '4xx': errorBodySchema, '5xx': errorBodySchema },
      ]);
      await app.close();
    });

    it('a hook 401 is normalised; a 0.9 body is a strict mismatch', async () => {
      const app = await textApp(async (reply) =>
        reply.status(401).send({ ...errorBody(401, 'Missing key'), x: 1 }),
      );
      const res = await app.inject('/readme');
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing key',
      });
      await app.close();
      const old = await textApp(async (reply) =>
        reply.status(401).send({ error: 'Unauthorized' }),
      );
      const mismatch = await old.inject('/readme');
      expect(mismatch.statusCode).toBe(500);
      expect(mismatch.json()).toEqual(MISMATCH);
      await old.close();
    });

    it('a hook 500 standard body keeps its message', async () => {
      const app = await textApp(async (reply) =>
        reply
          .status(500)
          .send({ statusCode: 500, error: 'x', message: 'Renderer offline' }),
      );
      const res = await app.inject('/readme');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Renderer offline',
      });
      await app.close();
    });

    it('sends bytes with the entry content type', async () => {
      const app = await buildTestApp();
      const res = await app.inject('/render');
      expect(res.headers['content-type']).toBe('image/png');
      expect(new Uint8Array(res.rawPayload)).toEqual(TEST_BYTES);
      await app.close();
    });

    it('sends text with the entry content type', async () => {
      const app = await buildTestApp();
      const res = await app.inject('/readme');
      expect(res.headers['content-type']).toMatch(/^text\/markdown/);
      expect(res.body).toBe('# Acme\n');
      await app.close();
    });

    it('keeps a handler content type and sends error statuses as JSON', async () => {
      const app = Fastify({ logger: false });
      const catalog = defineCatalog([testCatalog.byName('readme')]);
      let fail = false;
      await registerCatalogRoutes(app, catalog, {
        readme: () =>
          Promise.resolve(
            fail
              ? { status: 404 as const, body: { message: 'gone' } }
              : {
                  status: 200,
                  body: 'plain',
                  headers: { 'content-type': 'text/plain' },
                },
          ),
      });
      const ok = await app.inject('/readme');
      expect(ok.headers['content-type']).toMatch(/^text\/plain/);
      fail = true;
      const missing = await app.inject('/readme');
      expect(missing.statusCode).toBe(404);
      expect(missing.headers['content-type']).toMatch(/^application\/json/);
      expect(missing.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'gone',
      });
      await app.close();
    });
  });

  describe('standard handlers', () => {
    it('serve status, config and config apply', async () => {
      const app = await buildTestApp();
      const status = await app.inject('/status');
      expect(status.json()).toMatchObject({ name: 'acme', status: 'healthy' });
      expect((await app.inject('/config')).json()).toEqual({ a: 1 });
      expect((await app.inject('/config?path=$.a')).json()).toEqual({
        result: [1],
        count: 1,
      });
      const apply = await app.inject({
        method: 'POST',
        url: '/config/apply',
        payload: { patch: { a: 2 } },
      });
      expect(apply.json()).toEqual({ applied: true, config: { a: 2 } });
      const bad = await app.inject({
        method: 'POST',
        url: '/config/apply',
        payload: { patch: { a: 'x' } },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({
        statusCode: 400,
        code: JEEVES_CONFIG_INVALID,
        error: 'Bad Request',
        message:
          'Config validation failed: a: Invalid input: expected number, received string',
      });
      const query = await app.inject({
        url: '/config',
        query: { path: '$[?(' },
      });
      expect(query.statusCode).toBe(400);
      expect(query.json()).toEqual({
        statusCode: 400,
        code: JEEVES_CONFIG_QUERY_INVALID,
        error: 'Bad Request',
        message: 'Unexpected "?" at character 0',
      });
      await app.close();
    });
  });

  describe('auth hook on the root app', () => {
    it('applies to catalog routes: 401 without credentials, not-401 when open', async () => {
      const app = await buildTestApp({ auth: true });
      const open = testCatalog.entries.filter((e) => e.auth === 'none');
      const guarded = testCatalog.entries.filter((e) => e.auth !== 'none');
      expect(guarded.length).toBeGreaterThan(0);
      for (const entry of open)
        expect((await hit(app, entry)).statusCode).not.toBe(401);
      for (const entry of guarded) {
        const res = await hit(app, entry);
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing or wrong key',
        });
      }
      const authed = await app.inject({ url: '/config', headers: auth });
      expect(authed.statusCode).toBe(200);
      // An unknown route has no route URL; the hook lets it through.
      expect((await app.inject('/nowhere')).json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Route GET:/nowhere not found',
      });
      await app.close();
    });
  });

  it('leaves routes outside the scope untouched', async () => {
    const app = Fastify({ logger: false });
    app.post('/outside', (request, reply) =>
      reply.send({ got: request.body, extra: true }),
    );
    await registerCatalogRoutes(app, testCatalog, testHandlers);
    const res = await app.inject({
      method: 'POST',
      url: '/outside',
      payload: { any: 'thing' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ got: { any: 'thing' }, extra: true });
    await app.close();
  });

  it('never rewrites an error reply outside the scope', async () => {
    const app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url === '/hooked' || request.url === '/api/things/1')
        await reply.status(503).send({ detail: 'db 10.0.0.5 down' });
    });
    app.get('/teapot', (_request, reply) =>
      reply.code(418).send({ teapot: true }),
    );
    app.get('/text', (_request, reply) => reply.code(500).send('other secret'));
    app.get('/hooked', () => 'unreached');
    await app.register(
      async (api) => {
        await registerCatalogRoutes(api, deleteOnly, testHandlers);
        api.get('/sibling', (_request, reply) =>
          reply.code(418).send({ teapot: 'sibling' }),
        );
      },
      { prefix: '/api' },
    );
    const teapot = await app.inject('/teapot');
    expect(teapot.statusCode).toBe(418);
    expect(teapot.body).toBe('{"teapot":true}');
    const text = await app.inject('/text');
    expect(text.statusCode).toBe(500);
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(text.body).toBe('other secret');
    const hooked = await app.inject('/hooked');
    expect(hooked.statusCode).toBe(503);
    expect(hooked.body).toBe('{"detail":"db 10.0.0.5 down"}');
    const sibling = await app.inject('/api/sibling');
    expect(sibling.statusCode).toBe(418);
    expect(sibling.body).toBe('{"teapot":"sibling"}');
    // The same hook reply on a catalog route is answered by the scope (a
    // body without a message: the strict mismatch 500).
    const inside = await app.inject({ method: 'DELETE', url: '/api/things/1' });
    expect(inside.statusCode).toBe(500);
    expect(inside.json()).toEqual(MISMATCH);
    await app.close();
  });

  it('types handlers by entry name: missing or extra keys fail', () => {
    type H = CatalogHandlers<typeof deleteOnly>;
    // Exactly one key per entry name: no extra handler names.
    expectTypeOf<keyof H>().toEqualTypeOf<'deleteThing'>();
    // ...and none optional: an empty object isn't a full handler set.
    expectTypeOf<Record<string, never>>().not.toExtend<H>();
    const full: H = {
      deleteThing: () =>
        Promise.resolve({ status: 200, body: { deleted: true } }),
    };
    expect(Object.keys(full)).toEqual(['deleteThing']);
    expectTypeOf<Parameters<H['deleteThing']>[0]['params']>().toEqualTypeOf<{
      id: string;
    }>();
  });

  it('types a wrong success body as an error', () => {
    type Handler = CatalogHandlers<typeof deleteOnly>['deleteThing'];
    expectTypeOf<
      () => Promise<{ status: 200; body: { nope: number } }>
    >().not.toExtend<Handler>();
    expectTypeOf<
      () => Promise<{ status: 200; body: { deleted: boolean } }>
    >().toExtend<Handler>();
    expect(deleteOnly.entries).toHaveLength(1);
  });
});

describe('registerOpenApiRoute', () => {
  it('serves a prebuilt document at /openapi.json or a custom path', async () => {
    const document = buildOpenApiDocument(testCatalog, {
      title: 'Acme',
      version: '1.0.0',
    });
    const app = Fastify({ logger: false });
    registerOpenApiRoute(app, document);
    registerOpenApiRoute(app, document, { path: '/docs/api.json' });
    for (const url of ['/openapi.json', '/docs/api.json']) {
      const res = await app.inject(url);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.json()).toEqual(JSON.parse(JSON.stringify(document)));
    }
    await app.close();
  });
});
