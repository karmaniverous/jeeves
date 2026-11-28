/**
 * Raw request bodies through the client and transports (spec 0.12.0 §5.8,
 * #176).
 */
import Fastify from 'fastify';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';

import { registerCatalogRoutes } from '../fastify/registerCatalogRoutes.js';
import { injectTransport } from '../mcp/injectTransport.js';
import type { CatalogInput } from './buildCatalogRequest.js';
import { createCatalogClient } from './createCatalogClient.js';
import { defineCatalog } from './defineCatalog.js';
import { httpTransport } from './httpTransport.js';

const upload = {
  name: 'upload',
  method: 'PUT',
  path: '/upload/:name',
  description: 'Upload a file.',
  params: z.object({ name: z.string() }),
  requestContentType: 'application/octet-stream',
  bodyLimit: 1024,
  response: z.object({ name: z.string(), size: z.number() }),
  auth: 'none',
  kind: 'write',
} as const;

const catalog = defineCatalog([upload]);

/** A fetch that records its call and answers a fixed JSON body. */
function recordingFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify({ name: 'a.bin', size: 3 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

describe('raw request bodies (spec 5.8)', () => {
  it.each([
    ['Uint8Array', new Uint8Array([1, 2, 3])],
    ['Blob', new Blob([new Uint8Array([1, 2, 3])])],
  ])(
    'the client sends a %s body as raw bytes with the entry content type',
    async (_label, body) => {
      expectTypeOf<CatalogInput<typeof upload>['body']>().toEqualTypeOf<
        Uint8Array | Blob
      >();
      const { calls, fetchFn } = recordingFetch();
      const client = createCatalogClient(catalog, {
        baseUrl: 'http://svc',
        fetch: fetchFn,
      });
      expect(await client.upload({ name: 'a.bin', body })).toEqual({
        name: 'a.bin',
        size: 3,
      });
      expect(calls[0].url).toBe('http://svc/upload/a.bin');
      const headers = new Headers(calls[0].init.headers);
      expect(headers.get('content-type')).toBe('application/octet-stream');
      expect(calls[0].init.body).toBeInstanceOf(Uint8Array);
      expect([...(calls[0].init.body as Uint8Array)]).toEqual([1, 2, 3]);
    },
  );

  it('the client refuses a binary body that is not bytes', async () => {
    const { fetchFn } = recordingFetch();
    const client = createCatalogClient(catalog, {
      baseUrl: 'http://svc',
      fetch: fetchFn,
    });
    await expect(
      client.upload({ name: 'a.bin' } as unknown as Parameters<
        typeof client.upload
      >[0]),
    ).rejects.toThrow('body must be a Uint8Array or Blob');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('httpTransport refuses a request with both body and rawBody', async () => {
    const { fetchFn } = recordingFetch();
    const transport = httpTransport({ baseUrl: 'http://svc', fetch: fetchFn });
    await expect(
      transport(
        {
          method: 'PUT',
          path: '/upload/a.bin',
          query: [],
          headers: {},
          body: { a: 1 },
          rawBody: {
            contentType: 'application/octet-stream',
            data: new Uint8Array([1]),
          },
        },
        AbortSignal.timeout(5000),
      ),
    ).rejects.toThrow('body or rawBody, not both');
  });

  it('injectTransport delivers a raw body to the route as a Buffer', async () => {
    const app = Fastify({ logger: false });
    await registerCatalogRoutes(app, catalog, {
      upload: (input) =>
        Promise.resolve({
          status: 200,
          body: {
            name: input.params.name,
            size: Buffer.isBuffer(input.body) ? input.body.length : -1,
          },
        }),
    });
    const res = await injectTransport(app)(
      {
        method: 'PUT',
        path: '/upload/b.bin',
        query: [],
        headers: {},
        rawBody: {
          contentType: 'application/octet-stream',
          data: new Uint8Array([9, 9, 9, 9]),
        },
      },
      AbortSignal.timeout(5000),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'b.bin', size: 4 });
    await app.close();
  });
});
