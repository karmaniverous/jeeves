import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

import {
  buildTestApp,
  TEST_BYTES,
  TEST_KEY,
  testCatalog,
} from '../test/catalogTestApp.js';
import { CatalogClientError } from './clientError.js';
import { createCatalogClient } from './createCatalogClient.js';
import { defineCatalog } from './defineCatalog.js';

/** Await a rejection and return the CatalogClientError. */
async function failure(promise: Promise<unknown>): Promise<CatalogClientError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogClientError);
    return error as CatalogClientError;
  }
  throw new Error('expected a rejection');
}

describe('createCatalogClient against the test app', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildTestApp({ auth: true });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('calls entries by name and parses JSON responses', async () => {
    const client = createCatalogClient(testCatalog, { baseUrl });
    expect(await client.getThing({ id: 'x', tags: [1, 2] })).toEqual({
      id: 'x',
      tags: [1, 2],
      verbose: false,
    });
    expect(await client.status({})).toMatchObject({ name: 'acme' });
  });

  it('returns text and bytes for non-JSON entries', async () => {
    const client = createCatalogClient(testCatalog, { baseUrl });
    expect(await client.readme({})).toBe('# Acme\n');
    expect(await client.render({})).toEqual(TEST_BYTES);
  });

  it.each([
    ['value', TEST_KEY],
    ['lazy resolver', () => TEST_KEY],
    ['async resolver', () => Promise.resolve(TEST_KEY)],
  ])('attaches a bearer %s to protected entries', async (_label, bearer) => {
    const client = createCatalogClient(testCatalog, {
      baseUrl,
      auth: { bearer },
    });
    expect(await client.createThing({ name: 'n' })).toEqual({
      id: 'new',
      name: 'n',
    });
  });

  it('attaches nothing when the resolver returns undefined', async () => {
    const client = createCatalogClient(testCatalog, {
      baseUrl,
      auth: { bearer: () => undefined },
    });
    const error = await failure(client.createThing({ name: 'n' }));
    expect(error.status).toBe(401);
    expect(error.body).toEqual({ error: 'Unauthorized' });
  });

  it('resolves a lazy baseUrl on every call', async () => {
    const resolver = vi.fn(() => baseUrl);
    const client = createCatalogClient(testCatalog, { baseUrl: resolver });
    await client.status({});
    await client.status({});
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('throws CatalogClientError with the error body for a 4xx', async () => {
    const client = createCatalogClient(testCatalog, { baseUrl });
    const error = await failure(client.getThing({ id: 'missing' }));
    expect(error).toMatchObject({
      status: 404,
      body: { error: 'Not found' },
      message: 'getThing failed with HTTP 404',
    });
  });

  it('throws CatalogClientError for a 5xx', async () => {
    const client = createCatalogClient(testCatalog, { baseUrl });
    const error = await failure(client.broken({}));
    expect(error.status).toBe(500);
    expect(error.body).toEqual({ error: 'Response validation failed' });
  });

  it('rejects invalid input before sending, with status 0', async () => {
    const fetchSpy = vi.fn();
    const client = createCatalogClient(testCatalog, {
      baseUrl,
      fetch: fetchSpy,
    });
    const error = await failure(client.createThing({ name: '' }));
    expect(error.status).toBe(0);
    expect(error.issues?.[0]?.path).toEqual(['name']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws status 0 with the cause on network failure', async () => {
    const client = createCatalogClient(testCatalog, {
      baseUrl: 'http://127.0.0.1:1',
    });
    const error = await failure(client.status({}));
    expect(error.status).toBe(0);
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).toBe('status request failed');
  });
});

describe('createCatalogClient with a fetch spy', () => {
  const schemes = [
    { in: 'header', name: 'x-api-key' },
    { in: 'query', name: 'key' },
    { in: 'cookie', name: 'sess' },
  ] as const;
  const catalog = defineCatalog([
    {
      name: 'guarded',
      method: 'GET',
      path: '/guarded',
      description: 'Guarded.',
      response: z.object({ ok: z.boolean() }),
      auth: { schemes },
      kind: 'read',
    },
    {
      name: 'open',
      method: 'GET',
      path: '/open',
      description: 'Open.',
      response: z.object({ ok: z.boolean() }),
      auth: 'none',
      kind: 'read',
    },
    {
      name: 'bearerOnly',
      method: 'GET',
      path: '/bearer',
      description: 'Bearer only.',
      response: z.object({ ok: z.boolean() }),
      auth: { schemes: [{ in: 'bearer' }] },
      kind: 'read',
    },
  ]);

  /** A fetch spy answering every call with `body` at `status`. */
  const spy = (body: string = '{"ok":true}', status = 200) =>
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status })));

  /** URL and headers of the spy's only call. */
  const sent = (fetchSpy: ReturnType<typeof spy>) => {
    const [url, init] = fetchSpy.mock.calls[0];
    return {
      url: url as string,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
  };

  it.each([
    [
      'header',
      { header: { name: 'X-API-Key', value: 'k1' } },
      { url: 'http://svc/guarded', headers: { 'x-api-key': 'k1' } },
    ],
    [
      'query',
      { query: { name: 'key', value: () => 'k 2' } },
      { url: 'http://svc/guarded?key=k+2', headers: {} },
    ],
    [
      'cookie',
      { cookie: { name: 'sess', value: () => Promise.resolve('a;b') } },
      { url: 'http://svc/guarded', headers: { cookie: 'sess=a%3Bb' } },
    ],
  ] as const)('attaches a %s credential', async (_kind, auth, expected) => {
    const fetchSpy = spy();
    const client = createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      auth,
      fetch: fetchSpy,
    });
    expect(await client.guarded({})).toEqual({ ok: true });
    expect(sent(fetchSpy)).toEqual(expected);
  });

  it('never attaches to open entries or entries without a matching scheme', async () => {
    for (const name of ['open', 'bearerOnly'] as const) {
      const fetchSpy = spy();
      const client = createCatalogClient(catalog, {
        baseUrl: 'http://svc',
        auth: { header: { name: 'x-api-key', value: 'k1' } },
        fetch: fetchSpy,
      });
      await client[name]({});
      expect(sent(fetchSpy).headers).toEqual({});
    }
    const fetchSpy = spy();
    await createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      auth: { bearer: 'b' },
      fetch: fetchSpy,
    }).guarded({});
    expect(sent(fetchSpy).headers).toEqual({});
  });

  it('sends no credential when a resolver returns undefined', async () => {
    const fetchSpy = spy();
    await createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      auth: { bearer: () => undefined },
      fetch: fetchSpy,
    }).bearerOnly({});
    expect(sent(fetchSpy)).toEqual({ url: 'http://svc/bearer', headers: {} });
  });

  it('throws on a 2xx body that does not match the response schema', async () => {
    const client = createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      fetch: spy('{"ok":"yes"}'),
    });
    const error = await failure(client.open({}));
    expect(error.status).toBe(200);
    expect(error.issues?.[0]?.path).toEqual(['ok']);
    expect(error.body).toBeUndefined();
  });

  it('falls back to { error: text } for a non-JSON or shapeless error body', async () => {
    for (const body of ['Bad Gateway', '{"message":"x"}']) {
      const client = createCatalogClient(catalog, {
        baseUrl: 'http://svc',
        fetch: spy(body, 502),
      });
      const error = await failure(client.open({}));
      expect(error).toMatchObject({ status: 502, body: { error: body } });
    }
  });

  it('treats an unfollowed 3xx as an error', async () => {
    const client = createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      fetch: spy('Found', 302),
    });
    expect(await failure(client.open({}))).toMatchObject({
      status: 302,
      body: { error: 'Found' },
    });
  });

  it('keeps extra fields of a JSON error body', async () => {
    const client = createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      fetch: spy('{"error":"bad","code":"X"}', 400),
    });
    expect((await failure(client.open({}))).body).toEqual({
      error: 'bad',
      code: 'X',
    });
  });

  it('aborts after timeoutMs, default 120000', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const hang = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    const error = await failure(
      createCatalogClient(catalog, {
        baseUrl: 'http://svc',
        fetch: hang,
        timeoutMs: 20,
      }).open({}),
    );
    expect(error.status).toBe(0);
    expect((error.cause as Error).name).toBe('TimeoutError');
    expect(timeout).toHaveBeenLastCalledWith(20);
    await createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      fetch: spy(),
    }).open({});
    expect(timeout).toHaveBeenLastCalledWith(120_000);
    timeout.mockRestore();
  });

  it('types methods by entry name with input and response types', () => {
    const client = createCatalogClient(testCatalog, { baseUrl: 'http://svc' });
    expectTypeOf(client.getThing).parameter(0).toExtend<{ id: string }>();
    expectTypeOf(client.getThing).returns.resolves.toEqualTypeOf<{
      id: string;
      tags: number[];
      verbose: boolean;
    }>();
    expectTypeOf(client.readme).returns.resolves.toEqualTypeOf<string>();
    expectTypeOf(client.render).returns.resolves.toEqualTypeOf<Uint8Array>();
    expect(Object.keys(client)).toEqual(testCatalog.entries.map((e) => e.name));
  });
});
