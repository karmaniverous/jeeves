import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildTestApp, testCatalog } from '../test/catalogTestApp.js';
import {
  catalogToolDefinition,
  toolInputToRequest,
  toolResultFromResponse,
  toToolName,
} from './catalogTool.js';
import { CatalogClientError } from './clientError.js';
import { type CatalogResponse, httpTransport } from './httpTransport.js';
import type { CatalogEntry } from './types.js';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  name: 'doThing',
  method: 'POST',
  path: '/things',
  description: 'Do a thing.',
  body: z.object({ patch: z.record(z.string(), z.unknown()) }),
  response: z.object({}),
  auth: 'none',
  kind: 'write',
  ...over,
});

/** A fake transport response. */
const response = (
  status: number,
  body: string,
  json?: unknown,
): CatalogResponse => ({
  status,
  headers: new Headers(),
  json: () => Promise.resolve(json),
  text: () => Promise.resolve(body),
  bytes: () => Promise.resolve(new TextEncoder().encode(body)),
  body: null,
});

describe('toToolName', () => {
  it('snake-cases the entry name after the prefix', () => {
    expect(toToolName('watcher', 'configApply')).toBe('watcher_config_apply');
    expect(toToolName('server', 'getHTMLPage')).toBe('server_get_h_t_m_l_page');
    expect(toToolName('meta', 'status')).toBe('meta_status');
  });

  it('throws for names over 64 characters or with bad characters', () => {
    expect(() => toToolName('p', `a${'B'.repeat(40)}`)).toThrow(
      /must match .* \(1-64 characters/,
    );
    expect(() => toToolName('my.plugin', 'status')).toThrow(
      'Tool name "my.plugin_status" must match',
    );
    expect(toToolName('p', 'a'.repeat(62))).toHaveLength(64);
  });
});

describe('catalogToolDefinition', () => {
  it('builds name, description, output-mode schema without $schema', () => {
    const def = catalogToolDefinition(testCatalog.byName('getThing'), {
      prefix: 'acme',
    });
    expect(def.name).toBe('acme_get_thing');
    expect(def.description).toBe('Get a thing.');
    expect(def.inputSchema).not.toHaveProperty('$schema');
    expect(def.inputSchema).toMatchObject({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        tags: { type: 'array', items: { type: 'number' } },
        verbose: { type: 'boolean' },
      },
    });
  });

  it('applies a description override', () => {
    expect(
      catalogToolDefinition(entry(), { prefix: 'p', description: 'Custom.' })
        .description,
    ).toBe('Custom.');
  });

  it('renames aliased fields in properties and required', () => {
    const def = catalogToolDefinition(entry(), {
      prefix: 'p',
      inputAliases: { patch: 'config' },
    });
    expect(Object.keys(def.inputSchema.properties as object)).toEqual([
      'config',
    ]);
    expect(def.inputSchema.required).toEqual(['config']);
  });

  it.each([
    ['read', { readOnlyHint: true }],
    ['destructive', { destructiveHint: true }],
    ['write', {}],
  ] as const)('annotates %s entries', (kind, annotations) => {
    expect(
      catalogToolDefinition(entry({ kind }), { prefix: 'p' }).annotations,
    ).toEqual(annotations);
  });

  it('requires an alias for a "*" path parameter', () => {
    const readFile = testCatalog.byName('readFile');
    expect(() => catalogToolDefinition(readFile, { prefix: 'p' })).toThrow(
      `Tool for entry "readFile": the '*' path parameter requires an input alias`,
    );
    const def = catalogToolDefinition(readFile, {
      prefix: 'p',
      inputAliases: { '*': 'path' },
    });
    expect(def.inputSchema.required).toEqual(['path']);
  });

  it('rejects aliases of unknown fields and colliding aliases', () => {
    expect(() =>
      catalogToolDefinition(entry(), {
        prefix: 'p',
        inputAliases: { nope: 'x' },
      }),
    ).toThrow('input alias for unknown field "nope"');
    const two = entry({
      body: z.object({ a: z.string(), b: z.string() }),
    });
    expect(() =>
      catalogToolDefinition(two, { prefix: 'p', inputAliases: { a: 'b' } }),
    ).toThrow('input alias "b" collides with a field');
    expect(() =>
      catalogToolDefinition(two, {
        prefix: 'p',
        inputAliases: { a: 'x', b: 'x' },
      }),
    ).toThrow('input alias "x" collides');
  });

  it('omits properties and required for an entry without input', () => {
    const def = catalogToolDefinition(testCatalog.byName('status'), {
      prefix: 'p',
    });
    expect(def.inputSchema.required).toBeUndefined();
    expect(def.inputSchema).toMatchObject({ type: 'object' });
  });
});

describe('toolInputToRequest', () => {
  it('maps aliases back to entry fields', () => {
    expect(
      toolInputToRequest(entry(), { config: { a: 1 } }, { patch: 'config' })
        .body,
    ).toEqual({ patch: { a: 1 } });
  });

  it('encodes parsed values to their wire form', () => {
    const request = toolInputToRequest(testCatalog.byName('getThing'), {
      id: 'x',
      tags: [1, 2],
      verbose: true,
    });
    expect(request.query).toEqual([
      ['tags', '1'],
      ['tags', '2'],
      ['verbose', 'true'],
    ]);
  });

  it('throws CatalogClientError status 0 for invalid parameters', () => {
    let error: unknown;
    try {
      toolInputToRequest(testCatalog.byName('getThing'), {
        id: 'x',
        verbose: 'yes',
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(CatalogClientError);
    expect(error).toMatchObject({
      status: 0,
      issues: [{ path: ['verbose'] }],
    });
  });
});

describe('toolResultFromResponse', () => {
  const json = entry();
  const text = entry({ contentType: 'text/markdown', response: z.string() });
  const bytes = entry({
    contentType: 'image/png',
    response: z.instanceof(Uint8Array),
  });

  it('returns ok(data) for 2xx JSON, unparsed', async () => {
    const data = { a: 1, extra: true };
    expect(await toolResultFromResponse(json, response(200, '', data))).toEqual(
      { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] },
    );
  });

  it('returns ok(text) for 2xx text', async () => {
    expect(await toolResultFromResponse(text, response(200, '# Hi'))).toEqual({
      content: [{ type: 'text', text: '"# Hi"' }],
    });
  });

  it('fails for 2xx binary', async () => {
    expect(await toolResultFromResponse(bytes, response(200, 'x'))).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Binary response is not supported as a tool result',
        },
      ],
      isError: true,
    });
  });

  it.each([302, 404, 500])(
    'fails with HTTP status and body text for %i',
    async (status) => {
      expect(
        await toolResultFromResponse(bytes, response(status, '{"error":"x"}')),
      ).toEqual({
        content: [
          {
            type: 'text',
            text: `Error: HTTP ${String(status)}: {"error":"x"}`,
          },
        ],
        isError: true,
      });
    },
  );
});

describe('tool round trip through the test app', () => {
  let app: FastifyInstance;
  let send: ReturnType<typeof httpTransport>;

  beforeAll(async () => {
    app = await buildTestApp();
    send = httpTransport({
      baseUrl: await app.listen({ port: 0, host: '127.0.0.1' }),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Call an entry as a tool would: definition params in, result out. */
  const callTool = async (
    name: Parameters<typeof testCatalog.byName>[0],
    params: Record<string, unknown>,
    inputAliases?: Record<string, string>,
  ) => {
    const target = testCatalog.byName(name);
    const res = await send(
      toolInputToRequest(target, params, inputAliases),
      new AbortController().signal,
    );
    return toolResultFromResponse(target, res);
  };

  const text = (result: { content: { text: string }[] }) =>
    result.content[0].text;

  it('delivers parsed-shape tool input to the handler as the schema types', async () => {
    const result = await callTool('getThing', {
      id: 'a b',
      tags: [3, 4],
      verbose: true,
    });
    expect(JSON.parse(text(result))).toEqual({
      id: 'a b',
      tags: [3, 4],
      verbose: true,
    });
  });

  it('maps a wildcard alias back to the path', async () => {
    const result = await callTool(
      'readFile',
      { path: 'dir/x.md' },
      { '*': 'path' },
    );
    expect(JSON.parse(text(result))).toEqual({ path: 'dir/x.md' });
  });

  it('maps config back to patch on config apply', async () => {
    const result = await callTool(
      'configApply',
      { config: { a: 3 } },
      { patch: 'config' },
    );
    expect(JSON.parse(text(result))).toEqual({
      applied: true,
      config: { a: 3 },
    });
  });

  it('returns the 0.7.0 failure text for an error status', async () => {
    const result = await callTool('getThing', { id: 'missing' });
    expect(result).toEqual({
      content: [
        { type: 'text', text: 'Error: HTTP 404: {"error":"Not found"}' },
      ],
      isError: true,
    });
  });

  it('returns text for a text entry and fails for bytes', async () => {
    expect(text(await callTool('readme', {}))).toBe('"# Acme\\n"');
    expect((await callTool('render', {})).isError).toBe(true);
  });
});
