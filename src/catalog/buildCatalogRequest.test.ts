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

import { buildTestApp, testCatalog } from '../test/catalogTestApp.js';
import {
  buildCatalogRequest,
  type CatalogInput,
  type CatalogRequest,
} from './buildCatalogRequest.js';
import { CatalogClientError } from './clientError.js';
import { httpTransport } from './httpTransport.js';

const getThing = testCatalog.byName('getThing');
const createThing = testCatalog.byName('createThing');
const readFile = testCatalog.byName('readFile');

describe('buildCatalogRequest', () => {
  it('fills and encodes a path parameter', () => {
    expect(buildCatalogRequest(getThing, { id: 'a b/c' }).path).toBe(
      '/things/a%20b%2Fc',
    );
  });

  it('fills a wildcard keeping slashes', () => {
    expect(buildCatalogRequest(readFile, { '*': 'dir/a b.md' }).path).toBe(
      '/files/dir/a%20b.md',
    );
  });

  it('serialises query scalars and arrays, skipping undefined', () => {
    const request = buildCatalogRequest(getThing, {
      id: 'x',
      tags: [1, 2],
      verbose: 'true',
    });
    expect(request.query).toEqual([
      ['tags', '1'],
      ['tags', '2'],
      ['verbose', 'true'],
    ]);
    expect(
      buildCatalogRequest(getThing, { id: 'x', tags: 5, verbose: undefined })
        .query,
    ).toEqual([['tags', '5']]);
  });

  it('puts body fields in the body and nothing else', () => {
    const request = buildCatalogRequest(createThing, { name: 'n', size: 2 });
    expect(request).toEqual<CatalogRequest>({
      method: 'POST',
      path: '/things',
      query: [],
      body: { name: 'n', size: 2 },
      headers: {},
    });
    expect(buildCatalogRequest(getThing, { id: 'x' }).body).toBeUndefined();
  });

  it('throws CatalogClientError with status 0 and issues on invalid input', () => {
    let error: unknown;
    try {
      buildCatalogRequest(createThing, { name: '' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(CatalogClientError);
    expect(error).toMatchObject({
      status: 0,
      message: expect.stringMatching(
        /^Invalid input for "createThing": name: /,
      ) as string,
      issues: [{ path: ['name'], code: 'too_small' }],
    });
  });

  it('accepts no input for an entry without request fields', () => {
    expect(
      buildCatalogRequest(testCatalog.byName('readme'), undefined),
    ).toEqual({ method: 'GET', path: '/readme', query: [], headers: {} });
  });

  it('builds an error carrying status, body, issues and cause', () => {
    const cause = new Error('net');
    const error = new CatalogClientError('failed', {
      status: 503,
      body: { error: 'down', retry: true },
      cause,
    });
    expect(error).toMatchObject({
      name: 'CatalogClientError',
      message: 'failed',
      status: 503,
      body: { error: 'down', retry: true },
      cause,
    });
    expect(error.issues).toBeUndefined();
    expect(new CatalogClientError('x', { status: 0 }).body).toBeUndefined();
  });

  it('types the flat input from the slot schemas', () => {
    expectTypeOf<CatalogInput<typeof createThing>>().toEqualTypeOf<{
      name: string;
      size?: number | undefined;
    }>();
    // id is required: an empty input isn't a valid input type.
    expectTypeOf<Record<string, never>>().not.toExtend<
      CatalogInput<typeof getThing>
    >();
    expect(() => buildCatalogRequest(getThing, {} as never)).toThrow(
      CatalogClientError,
    );
  });
});

describe('httpTransport against the test app', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildTestApp();
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  const send = async (request: CatalogRequest, url: string = baseUrl) =>
    httpTransport({ baseUrl: `${url}/` })(
      request,
      new AbortController().signal,
    );

  it('reaches handlers with path, coerced query and arrays as the schema types', async () => {
    const one = await send(
      buildCatalogRequest(getThing, { id: 'a b/c', tags: 5, verbose: 'true' }),
    );
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual({ id: 'a b/c', tags: [5], verbose: true });
    const many = await send(
      buildCatalogRequest(getThing, { id: 'x', tags: [1, 2] }),
    );
    expect(await many.json()).toEqual({
      id: 'x',
      tags: [1, 2],
      verbose: false,
    });
  });

  it('reaches a wildcard handler', async () => {
    const res = await send(
      buildCatalogRequest(readFile, { '*': 'dir/a b.md' }),
    );
    expect(await res.json()).toEqual({ path: 'dir/a b.md' });
  });

  it('sends a JSON body', async () => {
    const res = await send(buildCatalogRequest(createThing, { name: 'n' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toBe('/things/new');
    expect(await res.json()).toEqual({ id: 'new', name: 'n' });
  });

  it('reads text and bytes', async () => {
    const readme = await send(
      buildCatalogRequest(testCatalog.byName('readme'), {}),
    );
    expect(await readme.text()).toBe('# Acme\n');
    const render = await send(
      buildCatalogRequest(testCatalog.byName('render'), {}),
    );
    expect(await render.bytes()).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(render.body).toBeInstanceOf(ReadableStream);
  });

  it('resolves a lazy baseUrl on every request', async () => {
    const resolver = vi.fn(() => baseUrl);
    const transport = httpTransport({ baseUrl: resolver });
    const request = buildCatalogRequest(getThing, { id: 'x' });
    await transport(request, new AbortController().signal);
    await transport(request, new AbortController().signal);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('rejects when the resolver yields no URL', async () => {
    await expect(
      httpTransport({ baseUrl: () => undefined })(
        buildCatalogRequest(getThing, { id: 'x' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('httpTransport: no base URL resolved');
  });

  it('honours the abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      httpTransport({ baseUrl })(
        buildCatalogRequest(getThing, { id: 'x' }),
        controller.signal,
      ),
    ).rejects.toThrow(/abort/i);
  });

  it('uses an injected fetch, with credentials headers', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    const request = {
      ...buildCatalogRequest(createThing, { name: 'n' }),
      headers: { authorization: 'Bearer k' },
    };
    await httpTransport({ baseUrl: 'http://svc//', fetch: fetchMock })(
      request,
      new AbortController().signal,
    );
    expect(fetchMock).toHaveBeenCalledWith('http://svc/things', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer k',
      },
      body: '{"name":"n"}',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });
});
