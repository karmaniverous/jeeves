/**
 * Definitions built once, `fixed` inputs and registration-time checks
 * (spec 0.12.0 §5.2, Decisions 94, 97).
 */
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import * as catalogTool from '../catalog/catalogTool.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import type {
  CatalogResponse,
  CatalogTransport,
} from '../catalog/httpTransport.js';
import {
  type CatalogMcpContent,
  prepareCatalogMcpServer,
} from './catalogMcpServer.js';

const CATALOG = defineCatalog([
  {
    name: 'fileContent',
    method: 'GET',
    path: '/file',
    description: 'Read a file.',
    query: z.object({ path: z.string(), raw: z.string().optional() }),
    response: z.object({ path: z.string(), raw: z.string().optional() }),
    auth: 'none',
    kind: 'read',
  },
  {
    name: 'upload',
    method: 'PUT',
    path: '/upload',
    description: 'Upload bytes.',
    requestContentType: 'application/octet-stream',
    bodyLimit: 1024,
    response: z.object({ ok: z.boolean() }),
    auth: 'none',
    kind: 'write',
  },
]);

type Content = CatalogMcpContent<typeof CATALOG>;

const base: Content = {
  name: 'srv',
  version: '1.0.0',
  catalog: CATALOG,
  prefix: 'srv',
  tools: { fileContent: true },
};

const reply = (body: unknown): CatalogResponse =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function connect(
  server: ReturnType<ReturnType<typeof prepareCatalogMcpServer>>,
) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

describe('prepareCatalogMcpServer', () => {
  it('builds the definitions once and reuses them for every server', async () => {
    const spy = vi.spyOn(catalogTool, 'catalogToolDefinition');
    const serverFor = prepareCatalogMcpServer(base);
    expect(spy).toHaveBeenCalledTimes(1);

    const transport = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ path: 'a' }));
    for (let i = 0; i < 3; i++) {
      const client = await connect(serverFor(transport));
      expect((await client.listTools()).tools).toHaveLength(1);
      await client.close();
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('binds each server to its own transport', async () => {
    const serverFor = prepareCatalogMcpServer(base);
    const first = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ path: '1' }));
    const second = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ path: '2' }));
    const a = await connect(serverFor(first));
    const b = await connect(serverFor(second));
    await a.callTool({ name: 'srv_file_content', arguments: { path: 'x' } });
    await b.callTool({ name: 'srv_file_content', arguments: { path: 'y' } });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('removes a fixed parameter from the published schema and always sends it', async () => {
    const transport = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ path: 'a', raw: '1' }));
    const client = await connect(
      prepareCatalogMcpServer({
        ...base,
        tools: { fileContent: { fixed: { raw: '1' } } },
      })(transport),
    );
    const [tool] = (await client.listTools()).tools;
    expect(tool.inputSchema.properties).not.toHaveProperty('raw');
    expect(tool.inputSchema.properties).toHaveProperty('path');

    await client.callTool({
      name: 'srv_file_content',
      arguments: { path: 'a' },
    });
    expect(transport.mock.calls[0][0].query).toContainEqual(['raw', '1']);
  });

  it('never sends a caller value for a fixed parameter', async () => {
    const transport = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ path: 'a' }));
    const client = await connect(
      prepareCatalogMcpServer({
        ...base,
        tools: { fileContent: { fixed: { raw: '1' } } },
      })(transport),
    );
    const result = await client.callTool({
      name: 'srv_file_content',
      arguments: { path: 'a', raw: '0' },
    });
    // The published schema has no `raw`, so the SDK refuses the argument
    // before the call: the caller can't override a fixed value.
    expect(result.isError).toBe(true);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an unknown entry',
      { tools: { nope: true } } as unknown as Partial<Content>,
      'unknown catalog entry "nope"',
    ],
    [
      'an alias of an unknown field',
      { tools: { fileContent: { inputAliases: { nope: 'x' } } } },
      'input alias for unknown field "nope"',
    ],
    [
      'a colliding alias',
      { tools: { fileContent: { inputAliases: { raw: 'path' } } } },
      'collides with a field',
    ],
    [
      'a fixed key that names no parameter',
      { tools: { fileContent: { fixed: { nope: 1 } } } },
      'fixed parameter "nope" is not a parameter',
    ],
    [
      'a parameter in both defaults and fixed',
      {
        tools: { fileContent: { defaults: { raw: '0' }, fixed: { raw: '1' } } },
      },
      '"raw" is in both defaults and fixed',
    ],
    [
      'a binary-body entry',
      { tools: { upload: true } },
      'binary request body cannot be a tool',
    ],
  ] as const)('throws at preparation for %s', (_label, overrides, message) => {
    expect(() =>
      prepareCatalogMcpServer({ ...base, ...(overrides as Partial<Content>) }),
    ).toThrow(message);
  });

  it('serves an entry with no inputs', async () => {
    const bare = defineCatalog([
      {
        name: 'status',
        method: 'GET',
        path: '/status',
        description: 'Status.',
        response: z.object({ ok: z.boolean() }),
        auth: 'none',
        kind: 'read',
      },
    ]);
    const transport = vi
      .fn<CatalogTransport>()
      .mockResolvedValue(reply({ ok: true }));
    const client = await connect(
      prepareCatalogMcpServer({
        name: 'srv',
        version: '1',
        catalog: bare,
        prefix: 'srv',
        tools: { status: true },
      })(transport),
    );
    const result = await client.callTool({ name: 'srv_status', arguments: {} });
    expect(result.isError).toBe(false);
  });

  it('throws for a duplicate tool name', () => {
    // `defineCatalog` keeps entry names unique, so a duplicate tool name
    // needs a catalog built without it (a defensive check).
    const entry = CATALOG.byName('fileContent');
    const clash = {
      ...CATALOG,
      entries: [entry, { ...entry, path: '/file2' }],
    } as unknown as typeof CATALOG;
    expect(() => prepareCatalogMcpServer({ ...base, catalog: clash })).toThrow(
      'duplicate tool name "srv_file_content"',
    );
  });
});
