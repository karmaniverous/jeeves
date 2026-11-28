/**
 * Binary request bodies, per-entry body limits and wildcard replies
 * (spec 0.12.0 §5.8, §5.2 Wildcard replies; #176).
 */
import Fastify, {
  type FastifyInstance,
  type onRequestHookHandler,
} from 'fastify';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';

import { SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { injectTransport } from '../mcp/injectTransport.js';
import { registerCatalogRoutes } from './registerCatalogRoutes.js';
import type { RequestInput } from './types.js';

const upload = {
  name: 'upload',
  method: 'PUT',
  path: '/upload/:name',
  description: 'Upload a file.',
  params: z.object({ name: z.string() }),
  requestContentType: 'application/octet-stream',
  bodyLimit: 16,
  response: z.object({ name: z.string(), size: z.number() }),
  auth: 'none',
  kind: 'write',
} as const;

const note = {
  name: 'note',
  method: 'POST',
  path: '/note',
  description: 'Create a note.',
  body: z.object({ text: z.string() }),
  bodyLimit: 4096,
  response: z.object({ length: z.number() }),
  auth: 'none',
  kind: 'write',
} as const;

const echo = {
  name: 'echo',
  method: 'POST',
  path: '/echo',
  description: 'Echo JSON.',
  body: z.object({ text: z.string() }),
  response: z.object({ text: z.string() }),
  auth: 'none',
  kind: 'write',
} as const;

const image = {
  name: 'image',
  method: 'GET',
  path: '/image',
  description: 'An image of the type the query asks for.',
  query: z.object({ type: z.string().optional() }),
  contentType: 'image/*',
  response: z.instanceof(Uint8Array),
  auth: 'none',
  kind: 'read',
} as const;

const catalog = defineCatalog([upload, note, echo, image]);

/** Handler spies, so a test can assert a handler never ran. */
const uploadHandler = vi.fn((input: RequestInput<typeof upload>) =>
  Promise.resolve({
    status: 200 as const,
    body: { name: input.params.name, size: input.body.length },
  }),
);

/** Build an app; `hook` adds a root `onRequest` hook first. */
async function build(
  hook?: onRequestHookHandler,
): Promise<{ app: FastifyInstance; errors: unknown[] }> {
  const app = Fastify({ logger: false });
  if (hook) app.addHook('onRequest', hook);
  const errors: unknown[] = [];
  await registerCatalogRoutes(
    app,
    catalog,
    {
      upload: uploadHandler,
      note: (input) =>
        Promise.resolve({
          status: 200,
          body: { length: input.body.text.length },
        }),
      echo: (input) =>
        Promise.resolve({ status: 200, body: { text: input.body.text } }),
      image: (input) => {
        const type = input.query.type;
        const headers: Record<string, string> = type
          ? { 'content-type': type }
          : { 'x-trace': '1' };
        return Promise.resolve({
          status: 200,
          body: new Uint8Array([1, 2, 3]),
          headers,
        });
      },
    },
    {
      logger: {
        error: (...args: unknown[]) => {
          errors.push(args);
        },
        warn: () => undefined,
      },
    },
  );
  await app.ready();
  return { app, errors };
}

const bytes = (n: number) => Buffer.alloc(n, 7);

describe('binary request bodies (spec 5.8)', () => {
  afterEach(() => {
    uploadHandler.mockClear();
  });

  it('hands the handler the raw bytes, typed and received as a Buffer', async () => {
    expectTypeOf<RequestInput<typeof upload>['body']>().toEqualTypeOf<Buffer>();
    expectTypeOf<RequestInput<typeof note>['body']>().toEqualTypeOf<{
      text: string;
    }>();
    const { app } = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/upload/a.bin',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes(10),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ name: 'a.bin', size: 10 });
    const received = uploadHandler.mock.calls[0][0].body as unknown;
    expect(Buffer.isBuffer(received)).toBe(true);
    await app.close();
  });

  it('answers 413 over the entry bodyLimit', async () => {
    const { app } = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/upload/a.bin',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes(17),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ statusCode: 413 });
    expect(uploadHandler).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['application/json', JSON.stringify({ a: 1 })],
    ['text/plain', 'hello'],
    ['image/png', bytes(4)],
  ])('answers 415 for %s', async (contentType, payload) => {
    const { app } = await build();
    const res = await app.inject({
      method: 'PUT',
      url: '/upload/a.bin',
      headers: { 'content-type': contentType },
      payload,
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ statusCode: 415 });
    expect(uploadHandler).not.toHaveBeenCalled();
    await app.close();
  });

  it('runs onRequest hooks before the body is read', async () => {
    const { app } = await build((request, reply, done) => {
      if (request.headers.authorization === 'Bearer ok') {
        done();
        return;
      }
      void reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'No key',
      });
    });
    // Over the limit and unauthenticated: the hook answers first, so the
    // body is never read (no 413).
    const refused = await app.inject({
      method: 'PUT',
      url: '/upload/a.bin',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes(64),
    });
    expect(refused.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'PUT',
      url: '/upload/a.bin',
      headers: {
        'content-type': 'application/octet-stream',
        authorization: 'Bearer ok',
      },
      payload: bytes(3),
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('leaves other routes unaffected by the parser', async () => {
    const { app } = await build();
    const json = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: { text: 'hi' },
    });
    expect(json.json()).toEqual({ text: 'hi' });
    const octet = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes(3),
    });
    expect(octet.statusCode).toBe(415);
    await app.close();
  });
});

describe('per-entry bodyLimit on JSON entries (spec 5.8)', () => {
  const big = { text: 'x'.repeat(2048) };

  it('raises the limit for that entry only', async () => {
    const app = Fastify({ logger: false, bodyLimit: 1024 });
    await registerCatalogRoutes(app, defineCatalog([note, echo]), {
      note: (input) =>
        Promise.resolve({
          status: 200,
          body: { length: input.body.text.length },
        }),
      echo: (input) =>
        Promise.resolve({ status: 200, body: { text: input.body.text } }),
    });
    const noted = await app.inject({
      method: 'POST',
      url: '/note',
      payload: big,
    });
    expect(noted.json()).toEqual({ length: 2048 });
    const echoed = await app.inject({
      method: 'POST',
      url: '/echo',
      payload: big,
    });
    expect(echoed.statusCode).toBe(413);

    // The raised limit also applies to an injected call.
    const transport = injectTransport(app);
    const res = await transport(
      { method: 'POST', path: '/note', query: [], headers: {}, body: big },
      AbortSignal.timeout(5000),
    );
    expect(res.status).toBe(200);
    await app.close();
  });
});

describe('wildcard replies (spec 5.2)', () => {
  it('sends the concrete type a handler sets', async () => {
    const { app } = await build();
    const res = await app.inject('/image?type=image/png');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    await app.close();
  });

  it('ignores media-type parameters and case when matching', async () => {
    const { app } = await build();
    const res = await app.inject(
      `/image?type=${encodeURIComponent('IMAGE/WebP; q=1')}`,
    );
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it.each([
    ['no content-type', ''],
    ['a range', 'image/*'],
    ['a non-matching type', 'text/plain'],
  ])(
    'answers a logged 500 for %s, never the literal range',
    async (_label, type) => {
      const { app, errors } = await build();
      const res = await app.inject(
        `/image${type ? `?type=${encodeURIComponent(type)}` : ''}`,
      );
      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).not.toContain('image/*');
      expect(res.json()).toMatchObject({
        statusCode: 500,
        message: SERVER_ERROR_MESSAGE,
      });
      expect(errors.length).toBeGreaterThan(0);
      await app.close();
    },
  );
});
