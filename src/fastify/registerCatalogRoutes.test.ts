import { STATUS_CODES } from 'node:http';

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

  describe('thrown errors: Fastify body, 5xx masked (spec 5c.5)', () => {
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

    it('a thrown Error with an enumerable field: 500, generic, no leak, cause logged', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const error = Object.assign(new Error('secret detail'), {
        extra: 'leak?',
      });
      const app = await throwing(error, { logger });
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: SERVER_ERROR_MESSAGE,
      });
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(logger.error).toHaveBeenCalledWith(
        { err: error },
        'Request failed',
      );
      await app.close();
    });

    it('a thrown 4xx: its status, message and code', async () => {
      const app = await throwing(
        Object.assign(new Error('Job j1 already exists'), {
          statusCode: 409,
          code: 'RUNNER_JOB_EXISTS',
          extra: 'leak?',
        }),
      );
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        statusCode: 409,
        code: 'RUNNER_JOB_EXISTS',
        error: 'Conflict',
        message: 'Job j1 already exists',
      });
      await app.close();
    });

    it('a createError error: code and formatted message kept', async () => {
      const JobExists = createError(
        'RUNNER_JOB_EXISTS',
        'Job %s already exists',
        409,
      );
      const app = await throwing(new JobExists('j1'));
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({
        statusCode: 409,
        code: 'RUNNER_JOB_EXISTS',
        error: 'Conflict',
        message: 'Job j1 already exists',
      });
      await app.close();
    });

    it('a createError 5xx keeps its code, masks its message', async () => {
      const Down = createError('ACME_DOWN', 'Database at 10.0.0.5 down', 503);
      const app = await throwing(new Down());
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        statusCode: 503,
        code: 'ACME_DOWN',
        error: 'Service Unavailable',
        message: SERVER_ERROR_MESSAGE,
      });
      await app.close();
    });

    it.each([
      [399, 500],
      [400, 400],
      [599, 599],
      [600, 500],
      [200, 500],
      [302, 500],
      [404.5, 500],
      ['404', 500],
    ])('statusCode %j answers %i', async (statusCode, status) => {
      const app = await throwing(Object.assign(new Error('m'), { statusCode }));
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(status);
      expect(res.json()).toEqual({
        statusCode: status,
        error: STATUS_CODES[status] ?? 'Error',
        message: status < 500 ? 'm' : SERVER_ERROR_MESSAGE,
      });
      await app.close();
    });

    it.each([
      ['a string', 'boom'],
      ['null', null],
      ['a non-string code and message', { code: 7, message: { a: 1 } }],
    ])('a thrown %s: 500 with no code', async (_label, thrown) => {
      const app = await throwing(thrown);
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: SERVER_ERROR_MESSAGE,
      });
      await app.close();
    });

    it('a thrown 4xx without a string message: empty message', async () => {
      const app = await throwing({ statusCode: 404, message: 42 });
      const res = await app.inject('/broken');
      expect(res.json()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: '',
      });
      await app.close();
    });

    it('never consults the app’s error handler', async () => {
      const appHandler = vi.fn();
      const app = await throwing(new Error('boom'), {}, (root) => {
        root.setErrorHandler(appHandler);
      });
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: SERVER_ERROR_MESSAGE,
      });
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

    it('a 5xx keeps its code, masks its message and logs it', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const app = await returning(
        {
          status: 503,
          body: { message: 'Database at 10.0.0.5 down', code: 'ACME_DOWN' },
        },
        { logger },
      );
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        statusCode: 503,
        code: 'ACME_DOWN',
        error: 'Service Unavailable',
        message: SERVER_ERROR_MESSAGE,
      });
      expect(logger.error).toHaveBeenCalledWith(
        {
          statusCode: 503,
          code: 'ACME_DOWN',
          message: 'Database at 10.0.0.5 down',
        },
        'Handler returned 5xx',
      );
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

    it('a 500 without a code has none', async () => {
      const app = await returning({ status: 500, body: { message: 'x' } });
      const res = await app.inject({ method: 'DELETE', url: '/things/1' });
      expect(res.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: SERVER_ERROR_MESSAGE,
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

    describe('replies sent from a root hook', () => {
      /** An app whose root `onRequest` hook answers `/things/:id` itself. */
      const hooked = async (
        hook: (reply: FastifyReply) => Promise<unknown>,
        options: RegisterCatalogRoutesOptions = {},
      ) => {
        const app = Fastify({ logger: false });
        app.addHook('onRequest', async (_request, reply) => {
          await hook(reply);
        });
        await registerCatalogRoutes(app, deleteOnly, testHandlers, options);
        return app;
      };

      it('strict: a body that is not Fastify’s is a mismatch', async () => {
        const app = await hooked(async (reply) =>
          reply.status(401).send({ error: 'Unauthorized' }),
        );
        const res = await app.inject({ method: 'DELETE', url: '/things/1' });
        expect(res.statusCode).toBe(500);
        expect(res.json()).toEqual(MISMATCH);
        await app.close();
      });

      it('log: a body that is not Fastify’s goes out unparsed', async () => {
        const app = await hooked(
          async (reply) => reply.status(401).send({ error: 'Unauthorized' }),
          { responseValidation: 'log' },
        );
        const res = await app.inject({ method: 'DELETE', url: '/things/1' });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({ error: 'Unauthorized' });
        await app.close();
      });

      it('an error thrown from the hook is answered by the scope', async () => {
        const Unauthorized = createError(
          'ACME_UNAUTHORIZED',
          'Missing key',
          401,
        );
        const app = await hooked(() => Promise.reject(new Unauthorized()));
        const res = await app.inject({ method: 'DELETE', url: '/things/1' });
        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({
          statusCode: 401,
          code: 'ACME_UNAUTHORIZED',
          error: 'Unauthorized',
          message: 'Missing key',
        });
        await app.close();
      });
    });
  });

  describe('non-JSON entries', () => {
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
