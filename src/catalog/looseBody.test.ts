import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildCatalogRequest } from './buildCatalogRequest.js';
import { catalogToolDefinition, toolInputToRequest } from './catalogTool.js';
import { defineCatalog } from './defineCatalog.js';

/** One POST entry per body strictness, each with a path param and a query. */
const catalog = defineCatalog(
  (
    [
      ['loose', z.looseObject({ a: z.string() })],
      ['plain', z.object({ a: z.string() })],
      ['strict', z.strictObject({ a: z.string() })],
      ['typed', z.object({ a: z.string() }).catchall(z.number())],
    ] as const
  ).map(([name, body]) => ({
    name,
    method: 'POST' as const,
    path: `/${name}/:id`,
    description: `${name} body.`,
    params: z.object({ id: z.string() }),
    query: z.object({ q: z.string().optional() }),
    body,
    response: z.object({}),
    auth: 'none' as const,
    kind: 'write' as const,
  })),
);
const input = { id: 'i', q: 'x', a: 'v', extra: { n: 1 } };

describe('loose request bodies', () => {
  it('the client sends unnamed fields only for a loose body', () => {
    expect(buildCatalogRequest(catalog.byName('loose'), input).body).toEqual({
      a: 'v',
      extra: { n: 1 },
    });
    expect(buildCatalogRequest(catalog.byName('plain'), input).body).toEqual({
      a: 'v',
    });
  });

  it('tools accept and send unnamed fields only for a loose body', () => {
    const loose = catalog.byName('loose');
    expect(toolInputToRequest(loose, input).body).toEqual({
      a: 'v',
      extra: { n: 1 },
    });
    expect(
      catalogToolDefinition(loose, { prefix: 'acme' }).inputSchema,
    ).not.toHaveProperty('additionalProperties', false);
    expect(
      catalogToolDefinition(catalog.byName('plain'), { prefix: 'acme' })
        .inputSchema,
    ).toHaveProperty('additionalProperties', false);
  });

  it('a typed catchall checks unnamed fields before sending them', () => {
    const typed = catalog.byName('typed');
    expect(() => buildCatalogRequest(typed, input)).toThrow(
      /Invalid input for "typed": extra: /,
    );
    expect(buildCatalogRequest(typed, { ...input, extra: 2 }).body).toEqual({
      a: 'v',
      extra: 2,
    });
    expect(
      catalogToolDefinition(typed, { prefix: 'acme' }).inputSchema,
    ).toHaveProperty('additionalProperties', { type: 'number' });
  });

  it('a strict body still rejects unnamed fields', () => {
    expect(() => buildCatalogRequest(catalog.byName('strict'), input)).toThrow(
      /Invalid input/,
    );
  });
});
