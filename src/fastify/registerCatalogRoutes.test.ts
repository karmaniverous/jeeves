import Fastify from 'fastify';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import { defineCatalog } from '../catalog/defineCatalog.js';
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
import type { CatalogHandlers } from './types.js';

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
    ...(entry.method === 'POST' ? { payload: {} } : {}),
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
    expect(missing.json()).toEqual({ error: 'Not found' });
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

  describe('request validation', () => {
    it('replies 400 with the default body and issues per slot', async () => {
      const app = await buildTestApp();
      const body = await app.inject({
        method: 'POST',
        url: '/things',
        payload: { name: '' },
      });
      expect(body.statusCode).toBe(400);
      expect(body.json()).toMatchObject({
        error: 'Request validation failed',
        issues: [{ slot: 'body', path: ['name'], code: 'too_small' }],
      });
      const query = await app.inject('/things/x?tags=abc');
      expect(query.statusCode).toBe(400);
      expect(query.json()).toMatchObject({
        issues: [{ slot: 'query', path: ['tags'] }],
      });
      await app.close();
    });

    it('uses a custom formatter', async () => {
      const app = await buildTestApp({
        formatValidationError: (issues, request) => ({
          error: 'Bad input',
          code: 'VALIDATION',
          count: issues.length,
          url: request.url,
        }),
      });
      const res = await app.inject({
        method: 'POST',
        url: '/things',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: 'Bad input',
        code: 'VALIDATION',
        count: 1,
        url: '/things',
      });
      await app.close();
    });

    it('rethrows other errors to the app error handler', async () => {
      const app = Fastify({ logger: false });
      app.setErrorHandler((_error, _request, reply) =>
        reply.status(418).send({ error: 'app handler' }),
      );
      const catalog = defineCatalog([testCatalog.byName('broken')]);
      await registerCatalogRoutes(app, catalog, {
        broken: () => Promise.reject(new Error('boom')),
      });
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(418);
      expect(res.json()).toEqual({ error: 'app handler' });
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

  describe('app error replies', () => {
    it.each([
      [{ message: 'app shape' }, 409],
      [{ code: 'E_APP', detail: { n: 1 } }, 500],
    ])(
      'sends the app error handler reply unchanged: %j',
      async (body, status) => {
        const app = Fastify({ logger: false });
        app.setErrorHandler((_error, _request, reply) =>
          reply.status(status).send(body),
        );
        const catalog = defineCatalog([testCatalog.byName('broken')]);
        await registerCatalogRoutes(app, catalog, {
          broken: () => Promise.reject(new Error('boom')),
        });
        const res = await app.inject('/broken');
        expect(res.statusCode).toBe(status);
        expect(res.json()).toEqual(body);
        expect(res.headers['content-type']).toMatch(/^application\/json/);
        await app.close();
      },
    );

    it.each([
      ['a JSON string', 'application/json', '{"error":"pre"}'],
      ['plain text', 'text/plain', 'app text'],
      ['an untyped string', undefined, 'app text'],
    ])(
      'sends %s from the app error handler as is',
      async (_label, type, payload) => {
        const app = Fastify({ logger: false });
        app.setErrorHandler((_error, _request, reply) => {
          if (type) void reply.type(type);
          return reply.status(500).send(payload);
        });
        const catalog = defineCatalog([testCatalog.byName('broken')]);
        await registerCatalogRoutes(app, catalog, {
          broken: () => Promise.reject(new Error('boom')),
        });
        const res = await app.inject('/broken');
        expect(res.body).toBe(payload);
        expect(res.headers['content-type']).toMatch(
          new RegExp(`^${type ?? 'text/plain'}`),
        );
        await app.close();
      },
    );
  });

  describe('response validation', () => {
    it('strict (default): logs at error and replies 500', async () => {
      const app = await buildTestApp();
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Response validation failed' });
      await app.close();
    });

    it('strict mismatch never reaches the app error handler', async () => {
      const app = Fastify({ logger: false });
      const appHandler = vi.fn();
      app.setErrorHandler(appHandler);
      await registerCatalogRoutes(app, testCatalog, testHandlers);
      const res = await app.inject('/broken');
      expect(res.statusCode).toBe(500);
      expect(appHandler).not.toHaveBeenCalled();
      await app.close();
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

    it.each([404, 503] as const)(
      'checks a %i body against the error body schema, keeping extra fields',
      async (status) => {
        let body: object = { message: 'no error field' };
        const app = Fastify({ logger: false });
        await registerCatalogRoutes(app, deleteOnly, {
          deleteThing: () => Promise.resolve({ status, body: body as never }),
        });
        const bad = await app.inject({ method: 'DELETE', url: '/things/1' });
        expect(bad.statusCode).toBe(500);
        expect(bad.json()).toEqual({ error: 'Response validation failed' });
        body = { error: 'nope', code: 'X' };
        const good = await app.inject({ method: 'DELETE', url: '/things/1' });
        expect(good.statusCode).toBe(status);
        expect(good.json()).toEqual({ error: 'nope', code: 'X' });
        await app.close();
      },
    );
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
              ? { status: 404 as const, body: { error: 'gone' } }
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
      expect(missing.json()).toEqual({ error: 'gone' });
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
      expect(bad.json()).toMatchObject({ error: 'Config validation failed' });
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
      for (const entry of guarded)
        expect((await hit(app, entry)).statusCode).toBe(401);
      const authed = await app.inject({ url: '/config', headers: auth });
      expect(authed.statusCode).toBe(200);
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
