import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineCatalog } from '../catalog/defineCatalog.js';
import { queryArray } from '../catalog/queryArray.js';
import { standardEntries } from '../catalog/standardEntries.js';
import type { CatalogEntry } from '../catalog/types.js';
import {
  buildOpenApiDocument,
  securitySchemeKey,
  toOpenApiPath,
} from './buildOpenApiDocument.js';
import {
  checkOpenApiDrift,
  writeOpenApiDocument,
} from './writeOpenApiDocument.js';

const info = { title: 'Acme API', version: '1.2.3' };

/** A catalog exercising every mapping in spec 5.6. */
const catalog = defineCatalog([
  ...standardEntries('acme', {
    auth: { config: { schemes: [{ in: 'bearer' }] } },
  }),
  {
    name: 'searchThings',
    method: 'POST',
    path: '/things/:kind/search',
    description: 'Search things.',
    params: z.object({ kind: z.enum(['a', 'b']) }),
    query: z.object({ tags: queryArray(z.coerce.number()).optional() }),
    body: z.object({ text: z.string() }),
    response: z.object({ hits: z.array(z.string()) }),
    auth: {
      schemes: [
        { in: 'query', name: 'key' },
        { in: 'cookie', name: 'jeeves-session' },
      ],
      insiderOnly: true,
    },
    kind: 'read',
  },
  {
    name: 'render',
    method: 'GET',
    path: '/render/*',
    description: 'Render a file.',
    params: z.object({ '*': z.string() }),
    response: z.instanceof(Uint8Array),
    contentType: 'image/png',
    auth: { schemes: [{ in: 'header', name: 'x-api-key' }] },
    kind: 'read',
  },
  {
    name: 'readme',
    method: 'GET',
    path: '/readme',
    description: 'Read the readme.',
    response: z.string(),
    contentType: 'text/markdown',
    auth: 'none',
    kind: 'read',
  },
]);

const doc = buildOpenApiDocument(catalog, info);
type Operation = {
  operationId: string;
  security: Record<string, string[]>[];
  parameters?: { in: string; name: string; schema: unknown }[];
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses: Record<string, { content: Record<string, { schema: unknown }> }>;
  'x-jeeves-insider-only'?: boolean;
};
const op = (path: string, method: string) =>
  (doc.paths as Record<string, Record<string, Operation>>)[path][method];

describe('buildOpenApiDocument', () => {
  it('validates as OpenAPI 3.1', async () => {
    const result = await new Validator().validate(
      JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
    );
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toEqual(info);
  });

  it('writes one operation per entry, operationId = name', () => {
    expect(Object.keys(doc.paths ?? {})).toEqual([
      '/status',
      '/config',
      '/config/apply',
      '/things/{kind}/search',
      '/render/{*}',
      '/readme',
    ]);
    expect(op('/config/apply', 'post').operationId).toBe('configApply');
    expect(op('/things/{kind}/search', 'post').operationId).toBe(
      'searchThings',
    );
  });

  it('converts request parameters in input mode (the wire shape)', () => {
    const params = op('/things/{kind}/search', 'post').parameters ?? [];
    expect(params.map((p) => [p.in, p.name])).toEqual([
      ['path', 'kind'],
      ['query', 'tags'],
    ]);
    expect(params[1].schema).toMatchObject({
      anyOf: [{ type: 'array' }, { type: 'number' }],
    });
    expect(
      op('/things/{kind}/search', 'post').requestBody?.content[
        'application/json'
      ].schema,
    ).toMatchObject({ properties: { text: { type: 'string' } } });
  });

  it('writes binary and text content for non-JSON entries', () => {
    expect(op('/render/{*}', 'get').responses['200'].content).toEqual({
      'image/png': { schema: { type: 'string', format: 'binary' } },
    });
    expect(op('/readme', 'get').responses['200'].content).toEqual({
      'text/markdown': { schema: { type: 'string' } },
    });
  });

  it('references the shared ErrorBody component from every operation', () => {
    for (const methods of Object.values(
      doc.paths as Record<string, Record<string, Operation>>,
    ))
      for (const o of Object.values(methods))
        expect(o.responses.default.content['application/json'].schema).toEqual({
          $ref: '#/components/schemas/ErrorBody',
        });
    expect(doc.components?.schemas?.ErrorBody).toMatchObject({
      required: ['error'],
    });
  });

  it('maps auth to security per scheme', () => {
    expect(doc.components?.securitySchemes).toEqual({
      bearer: { type: 'http', scheme: 'bearer' },
      query_key: { type: 'apiKey', in: 'query', name: 'key' },
      cookie_jeeves_session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'jeeves-session',
      },
      header_x_api_key: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    });
    expect(op('/status', 'get').security).toEqual([]);
    expect(op('/config', 'get').security).toEqual([{ bearer: [] }]);
    expect(op('/things/{kind}/search', 'post').security).toEqual([
      { query_key: [] },
      { cookie_jeeves_session: [] },
    ]);
    expect(op('/things/{kind}/search', 'post')['x-jeeves-insider-only']).toBe(
      true,
    );
    expect(op('/config', 'get')['x-jeeves-insider-only']).toBeUndefined();
  });

  it('omits securitySchemes when every entry is open', () => {
    const open = buildOpenApiDocument(
      defineCatalog(standardEntries('acme', { auth: { config: 'none' } })),
      info,
    );
    expect(open.components?.securitySchemes).toBeUndefined();
  });

  it('merges methods on the same path', () => {
    const entry = (name: string, method: CatalogEntry['method']) => ({
      name,
      method,
      path: '/items',
      description: name,
      response: z.object({}),
      auth: 'none' as const,
      kind: 'read' as const,
    });
    const merged = buildOpenApiDocument(
      defineCatalog([entry('list', 'GET'), entry('create', 'POST')]),
      info,
    );
    expect(Object.keys((merged.paths ?? {})['/items'] ?? {})).toEqual([
      'get',
      'post',
    ]);
  });

  it('helpers map paths and scheme keys', () => {
    expect(toOpenApiPath('/a/:b/c/:d_e/*')).toBe('/a/{b}/c/{d_e}/{*}');
    expect(securitySchemeKey({ in: 'header', name: 'X-Api.Key' })).toBe(
      'header_X_Api_Key',
    );
  });
});

describe('writeOpenApiDocument and checkOpenApiDrift', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jeeves-openapi-'));

  it('writes 2-space JSON with a trailing newline, then reports no drift', () => {
    const file = join(dir, 'openapi.json');
    writeOpenApiDocument(catalog, info, file);
    const text = readFileSync(file, 'utf8');
    expect(text).toBe(JSON.stringify(doc, null, 2) + '\n');
    expect(checkOpenApiDrift(catalog, info, file)).toEqual({ ok: true });
  });

  it('ignores CRLF line endings', () => {
    const file = join(dir, 'crlf.json');
    writeFileSync(
      file,
      (JSON.stringify(doc, null, 2) + '\n').replace(/\n/g, '\r\n'),
    );
    expect(checkOpenApiDrift(catalog, info, file).ok).toBe(true);
  });

  it('reports drift after a catalog change, with the differing lines', () => {
    const file = join(dir, 'drift.json');
    writeOpenApiDocument(catalog, info, file);
    const result = checkOpenApiDrift(
      catalog,
      { ...info, version: '9.9.9' },
      file,
    );
    expect(result.ok).toBe(false);
    expect(result.diff).toContain('-     "version": "1.2.3"');
    expect(result.diff).toContain('+     "version": "9.9.9"');
  });

  it('lists lines only the committed file has', () => {
    const file = join(dir, 'longer.json');
    writeFileSync(file, JSON.stringify(doc, null, 2) + '\nextra\n');
    const { diff } = checkOpenApiDrift(catalog, info, file);
    expect(diff).toContain('- extra');
    expect(diff).not.toContain('+ extra');
  });

  it('lists lines only the generated document has', () => {
    const file = join(dir, 'shorter.json');
    const generated = JSON.stringify(doc, null, 2).split('\n');
    writeFileSync(file, generated.slice(0, -2).join('\n'));
    const { diff } = checkOpenApiDrift(catalog, info, file);
    const last = generated.at(-1) ?? '';
    expect(diff).toContain(`+ ${last}`);
    expect(diff).not.toContain(`- ${last}`);
  });

  it('caps a large diff', () => {
    const file = join(dir, 'empty.json');
    writeFileSync(file, '\n'.repeat(200));
    const lines = checkOpenApiDrift(catalog, info, file).diff?.split('\n');
    expect(lines?.length).toBeLessThanOrEqual(60);
  });

  it('reports a missing file as drift', () => {
    expect(checkOpenApiDrift(catalog, info, join(dir, 'nope.json'))).toEqual({
      ok: false,
      diff: `${join(dir, 'nope.json')} does not exist; run the writer.`,
    });
  });
});
