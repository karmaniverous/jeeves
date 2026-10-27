import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineCatalog } from '../catalog/defineCatalog.js';
import { standardEntries } from '../catalog/standardEntries.js';
import { makeTestDescriptor } from '../test/makeTestDescriptor.js';
import { createPluginToolset } from './createPluginToolset.js';
import type { PluginApi, ToolDescriptor } from './types.js';

vi.mock('../service/createServiceManager', () => ({
  createServiceManager: () => ({}),
}));

const bearer = { schemes: [{ in: 'bearer' }] } as const;

const catalog = defineCatalog([
  ...standardEntries('acme', { auth: { config: bearer } }),
  {
    name: 'search',
    method: 'POST',
    path: '/search',
    description: 'Search the archive.',
    body: z.object({ query: z.string(), limit: z.number().optional() }),
    response: z.object({ hits: z.array(z.string()) }),
    auth: bearer,
    kind: 'read',
  },
  {
    name: 'readFile',
    method: 'GET',
    path: '/files/*',
    description: 'Read a file.',
    params: z.object({ '*': z.string() }),
    response: z.object({ path: z.string() }),
    auth: 'none',
    kind: 'read',
  },
  {
    name: 'purge',
    method: 'DELETE',
    path: '/purge',
    description: 'Purge everything.',
    response: z.object({ purged: z.number() }),
    auth: bearer,
    kind: 'destructive',
  },
]);

const descriptor = makeTestDescriptor({ name: 'acme', defaultPort: 4321 });

/** A fetch stub answering 200 JSON; records calls. */
function stubFetch(body: unknown = { ok: true }) {
  const fetchMock = vi.fn<
    (input: string, init?: RequestInit) => Promise<Response>
  >(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const byName = (tools: ToolDescriptor[]) =>
  Object.fromEntries(tools.map((t) => [t.name, t]));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createPluginToolset with a catalog', () => {
  it('orders standard, then catalog tools in catalog order, then custom', () => {
    const custom: ToolDescriptor = {
      name: 'acme_custom',
      description: 'Custom.',
      parameters: { type: 'object', properties: {} },
      execute: () => Promise.resolve({ content: [] }),
    };
    const tools = createPluginToolset(
      { ...descriptor, customPluginTools: () => [custom] },
      {
        catalog,
        tools: {
          purge: true,
          search: { catalogMode: 'direct-only', description: 'Find.' },
        },
        api: { registerTool: vi.fn() },
      },
    );
    expect(tools.map((t) => t.name)).toEqual([
      'acme_status',
      'acme_config',
      'acme_config_apply',
      'acme_service',
      'acme_search',
      'acme_purge',
      'acme_custom',
    ]);
    const tool = byName(tools);
    expect(tool.acme_search.catalogMode).toBe('direct-only');
    expect(tool.acme_search.description).toBe('Find.');
    expect(tool.acme_purge.description).toBe('Purge everything.');
    expect(tool.acme_purge).not.toHaveProperty('catalogMode');
  });

  it('keeps the 0.7.0 standard descriptions whatever the catalog says', () => {
    const other = defineCatalog(
      standardEntries('other', { auth: { config: 'none' } }),
    );
    expect(
      createPluginToolset(descriptor, { catalog: other })
        .slice(0, 3)
        .map((t) => t.description),
    ).toEqual([
      'Get acme service health, version, and uptime.',
      'Query acme running configuration. Optional JSONPath filter.',
      'Apply a config patch to the running acme service.',
    ]);
  });

  it('appends customPluginTools only when api is passed', () => {
    const customPluginTools = vi.fn(() => []);
    createPluginToolset({ ...descriptor, customPluginTools }, {});
    expect(customPluginTools).not.toHaveBeenCalled();
    const api: PluginApi = { registerTool: vi.fn() };
    createPluginToolset({ ...descriptor, customPluginTools }, { api });
    expect(customPluginTools).toHaveBeenCalledWith(api);
  });

  it('throws on a duplicate tool name', () => {
    const clash: ToolDescriptor = {
      name: 'acme_status',
      description: 'Clash.',
      parameters: {},
      execute: () => Promise.resolve({ content: [] }),
    };
    expect(() =>
      createPluginToolset(
        { ...descriptor, customPluginTools: () => [clash] },
        { api: { registerTool: vi.fn() } },
      ),
    ).toThrow('Duplicate tool name: acme_status');
    expect(() =>
      createPluginToolset(descriptor, { catalog, tools: { status: true } }),
    ).toThrow('Duplicate tool name: acme_status');
  });

  it('requires a catalog for tools and known entry names', () => {
    expect(() =>
      createPluginToolset(descriptor, {
        tools: { search: true } as never,
      }),
    ).toThrow('createPluginToolset: tools requires catalog');
    expect(() =>
      createPluginToolset(descriptor, {
        catalog,
        tools: { nope: true } as never,
      }),
    ).toThrow('createPluginToolset: tools names unknown entry "nope"');
  });

  it('maps an aliased wildcard and sends catalog tool calls', async () => {
    const fetchMock = stubFetch({ path: 'a/b.md' });
    const tool = byName(
      createPluginToolset(descriptor, {
        apiUrl: 'http://svc',
        catalog,
        tools: { readFile: { inputAliases: { '*': 'path' } } },
      }),
    );
    expect(tool.acme_read_file.parameters).toMatchObject({
      required: ['path'],
    });
    const result = await tool.acme_read_file.execute('1', { path: 'a/b.md' });
    expect(result.isError).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('http://svc/files/a/b.md');
  });

  it('fails invalid input without a request', async () => {
    const fetchMock = stubFetch();
    const tool = byName(
      createPluginToolset(descriptor, { catalog, tools: { search: true } }),
    );
    const result = await tool.acme_search.execute('1', { query: 3 });
    expect(result).toMatchObject({
      isError: true,
      content: [{ text: 'Error: Invalid input for "search"' }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createPluginToolset credentials', () => {
  /** The authorization header sent by a tool call. */
  const sentAuth = async (
    tools: ToolDescriptor[],
    name: string,
    params: Record<string, unknown> = {},
  ) => {
    const fetchMock = stubFetch();
    await byName(tools)[name].execute('1', params);
    const init = fetchMock.mock.calls[0][1];
    return (init?.headers as Record<string, string>).authorization;
  };

  it('reach the standard tools only when a catalog is passed', async () => {
    const auth = { bearer: () => 'k1' };
    expect(
      await sentAuth(createPluginToolset(descriptor, { auth }), 'acme_config'),
    ).toBeUndefined();
    expect(
      await sentAuth(
        createPluginToolset(descriptor, { auth, catalog }),
        'acme_config',
      ),
    ).toBe('Bearer k1');
    expect(
      await sentAuth(
        createPluginToolset(descriptor, { auth, catalog }),
        'acme_status',
      ),
    ).toBeUndefined();
  });

  it('reach catalog tools whose entry lists the scheme', async () => {
    const tools = createPluginToolset(descriptor, {
      auth: { bearer: 'k2' },
      catalog,
      tools: { search: true },
    });
    expect(await sentAuth(tools, 'acme_search', { query: 'q' })).toBe(
      'Bearer k2',
    );
  });
});

describe('createPluginToolset defaults', () => {
  it('calls 127.0.0.1:<defaultPort> without apiUrl', async () => {
    const fetchMock = stubFetch();
    await byName(createPluginToolset(descriptor, {})).acme_status.execute(
      '1',
      {},
    );
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:4321/status');
  });

  it('times out catalog tools after DEFAULT_FETCH_TIMEOUT_MS', async () => {
    stubFetch();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await byName(
      createPluginToolset(descriptor, { catalog, tools: { purge: true } }),
    ).acme_purge.execute('1', {});
    expect(timeout).toHaveBeenLastCalledWith(120_000);
  });
});
