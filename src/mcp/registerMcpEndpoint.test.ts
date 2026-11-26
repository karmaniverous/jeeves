import type { IncomingHttpHeaders } from 'node:http';

import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { errorBody } from '../api/errorBody.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { registerCatalogRoutes } from '../fastify/registerCatalogRoutes.js';
import {
  credentialHeaderNames,
  MCP_PATH,
  type McpEndpointOptions,
  registerMcpEndpoint,
} from './registerMcpEndpoint.js';

const KEY = 'test-key';
const bearer = { schemes: [{ in: 'bearer' }] } as const;

const CATALOG = defineCatalog([
  {
    name: 'getThing',
    method: 'GET',
    path: '/things/:id',
    description: 'Get a thing.',
    params: z.object({ id: z.string() }),
    response: z.object({ id: z.string() }),
    auth: 'none',
    kind: 'read',
  },
  {
    name: 'createThing',
    method: 'POST',
    path: '/things',
    description: 'Create a thing.',
    body: z.object({ name: z.string() }),
    response: z.object({ id: z.string(), name: z.string() }),
    auth: bearer,
    kind: 'write',
  },
]);

const SKILL = { uri: 'skill://acme/SKILL.md', name: 'acme', text: '# Acme\n' };

let app: FastifyInstance;
/** Headers of every request the app's routes received (not `/mcp` itself). */
let seen: IncomingHttpHeaders[];

afterEach(async () => {
  await app.close();
});

/** An app with a bearer hook on `createThing`, the catalog routes and `/mcp`. */
async function build(
  options: Partial<McpEndpointOptions<typeof CATALOG>> = {},
): Promise<FastifyInstance> {
  seen = [];
  app = Fastify({ logger: false });
  app.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.url === '/things/:id' || request.url === '/things')
      seen.push(request.headers);
    if (
      request.method === 'POST' &&
      request.url === '/things' &&
      request.headers.authorization !== `Bearer ${KEY}`
    )
      await reply.status(401).send(errorBody(401, 'Missing or wrong key'));
  });
  await registerCatalogRoutes(app, CATALOG, {
    getThing: ({ params }) =>
      Promise.resolve({ status: 200, body: { id: params.id } }),
    createThing: ({ body }) =>
      Promise.resolve({ status: 201, body: { id: 'new', name: body.name } }),
  });
  registerMcpEndpoint(app, {
    name: 'acme',
    version: '1.2.3',
    catalog: CATALOG,
    prefix: 'acme',
    tools: { getThing: true, createThing: true },
    instructions: 'Rules.',
    skill: SKILL,
    ...options,
  });
  await app.ready();
  return app;
}

/** One 2025-era JSON-RPC request (no envelope), as stateless clients send. */
function rpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  url = MCP_PATH,
) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
}

/** The JSON-RPC result of a 2025-era reply: one SSE `message` event. */
function resultOf(res: { body: string }): Record<string, unknown> {
  const data = /^data: (.*)$/m.exec(res.body);
  if (!data) throw new Error(`no SSE data: ${res.body}`);
  return (JSON.parse(data[1]) as { result: Record<string, unknown> }).result;
}

/** A `fetch` answered by `app.inject`, for the MCP client. */
const injectFetch = async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const body = await request.text();
  const res = await app.inject({
    method: request.method as 'POST',
    url: url.pathname + url.search,
    headers: Object.fromEntries(request.headers),
    ...(body ? { payload: body } : {}),
  });
  return new Response(res.statusCode === 202 ? null : res.rawPayload, {
    status: res.statusCode,
    headers: res.headers as Record<string, string>,
  });
};

/** A connected MCP client over the endpoint, sending `headers`. */
async function client(
  headers: Record<string, string> = {},
  modern = false,
): Promise<{ mcp: Client; transport: StreamableHTTPClientTransport }> {
  const mcp = new Client(
    { name: 'test', version: '0' },
    modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost${MCP_PATH}`),
    { fetch: injectFetch, requestInit: { headers } },
  );
  await mcp.connect(transport);
  return { mcp, transport };
}

/** The text of a tool result's first content block. */
function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [block] = result.content;
  if (block.type !== 'text') throw new Error('no text content');
  return block.text;
}

describe('registerMcpEndpoint', () => {
  it('answers a 2025-era initialize with the server info, instructions and resources', async () => {
    await build();

    const res = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });

    expect(res.statusCode).toBe(200);
    expect(resultOf(res)).toMatchObject({
      serverInfo: { name: 'acme', version: '1.2.3' },
      instructions: 'Rules.',
      capabilities: { tools: {}, resources: {} },
    });
  });

  it('lists the selected tools to a stateless 2025-era client', async () => {
    await build();

    const res = await rpc('tools/list');

    expect(
      (resultOf(res).tools as { name: string }[]).map((t) => t.name),
    ).toEqual(['acme_get_thing', 'acme_create_thing']);
  });

  it.each([
    ['2025-11-25', false],
    ['2026-07-28', true],
  ])(
    'serves a %s client: tools, calls through the app routes, the skill',
    async (version, modern) => {
      await build();
      const { mcp, transport } = await client({}, modern);

      expect(transport.protocolVersion).toBe(version);
      expect((await mcp.listTools()).tools).toHaveLength(2);
      const result = await mcp.callTool({
        name: 'acme_get_thing',
        arguments: { id: 'x' },
      });
      expect(result.isError).toBe(false);
      expect(JSON.parse(textOf(result))).toEqual({ id: 'x' });
      expect((await mcp.readResource({ uri: SKILL.uri })).contents).toEqual([
        { uri: SKILL.uri, mimeType: 'text/markdown', text: SKILL.text },
      ]);
      await mcp.close();
    },
  );

  it("forwards the caller's credential headers, and only those, to the routes", async () => {
    await build();
    const { mcp } = await client({
      authorization: `Bearer ${KEY}`,
      'x-other': 'no',
    });

    const result = await mcp.callTool({
      name: 'acme_create_thing',
      arguments: { name: 'n' },
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(textOf(result))).toEqual({ id: 'new', name: 'n' });
    expect(seen.at(-1)?.authorization).toBe(`Bearer ${KEY}`);
    expect(seen.at(-1)).not.toHaveProperty('x-other');
    await mcp.close();
  });

  it("returns the route's 401 as an error result without the caller's key", async () => {
    await build();

    const res = await rpc('tools/call', {
      name: 'acme_create_thing',
      arguments: { name: 'n' },
    });
    const result = resultOf(res) as {
      isError: boolean;
      content: { text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('401');
  });

  it('refuses a browser Origin that is not allowed, with 403 and no tool call', async () => {
    await build();

    const res = await rpc(
      'tools/call',
      { name: 'acme_get_thing', arguments: { id: 'x' } },
      { origin: 'http://evil.example' },
    );

    expect(res.statusCode).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it('allows localhost origins by default and only the listed ones when set', async () => {
    await build();
    expect(
      (await rpc('tools/list', {}, { origin: 'http://localhost:5173' }))
        .statusCode,
    ).toBe(200);
    await app.close();

    await build({ allowedOrigins: ['app.example'] });
    expect(
      (await rpc('tools/list', {}, { origin: 'https://app.example' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await rpc('tools/list', {}, { origin: 'http://localhost:5173' }))
        .statusCode,
    ).toBe(403);
  });

  it('answers 405 for GET and DELETE (no sessions)', async () => {
    await build();

    for (const method of ['GET', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: MCP_PATH,
        headers: { accept: 'application/json, text/event-stream' },
      });
      expect(res.statusCode).toBe(405);
    }
  });

  it('serves on a custom path', async () => {
    await build({ path: '/acme/mcp' });

    expect((await rpc('tools/list', {}, {}, '/acme/mcp')).statusCode).toBe(200);
    expect((await rpc('tools/list')).statusCode).toBe(404);
  });
});

describe('credentialHeaderNames', () => {
  it('names the bearer, header and cookie scheme headers, lowercased, never a query', () => {
    const catalog = defineCatalog([
      ...CATALOG.entries,
      {
        name: 'keyed',
        method: 'GET',
        path: '/keyed',
        description: 'Keyed.',
        response: z.object({}),
        auth: {
          schemes: [
            { in: 'header', name: 'X-Api-Key' },
            { in: 'cookie', name: 'session' },
            { in: 'query', name: 'key' },
          ],
        },
        kind: 'read',
      },
    ]);

    expect(credentialHeaderNames(catalog)).toEqual([
      'authorization',
      'cookie',
      'x-api-key',
    ]);
  });
});
