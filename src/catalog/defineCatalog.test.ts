import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import * as zm from 'zod/mini';

import { CatalogDefinitionError, defineCatalog } from './defineCatalog.js';
import { queryArray } from './queryArray.js';
import { standardEntries } from './standardEntries.js';
import type { AuthSpec, CatalogEntry } from './types.js';

/** A valid GET entry; override fields per test. */
const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  name: 'getThing',
  method: 'GET',
  path: '/things/:id',
  description: 'Get a thing.',
  params: z.object({ id: z.string() }),
  response: z.object({ id: z.string() }),
  auth: 'none',
  kind: 'read',
  ...over,
});

/** Violations `defineCatalog` reports for these entries. */
function violations(entries: readonly CatalogEntry[]): readonly string[] {
  try {
    defineCatalog(entries);
  } catch (err) {
    expect(err).toBeInstanceOf(CatalogDefinitionError);
    return (err as CatalogDefinitionError).violations;
  }
  return [];
}

describe('defineCatalog', () => {
  it('accepts a valid catalog and freezes it', () => {
    const catalog = defineCatalog([entry()]);
    expect(catalog.entries).toHaveLength(1);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.entries)).toBe(true);
    expect(catalog.byName('getThing').path).toBe('/things/:id');
  });

  it('byName throws for an unknown name', () => {
    const catalog = defineCatalog([entry()]);
    expect(() => catalog.byName('nope' as 'getThing')).toThrow(
      'No catalog entry named "nope"',
    );
  });

  it.each<[string, CatalogEntry[], RegExp]>([
    ['rule 1: name not camelCase', [entry({ name: 'Get-thing' })], /camelCase/],
    [
      'rule 1: duplicate name',
      [entry(), entry({ path: '/x/:id' })],
      /duplicate name/,
    ],
    [
      'rule 2: duplicate route',
      [entry(), entry({ name: 'other' })],
      /duplicate route GET \/things\/:id \(also "getThing"\)/,
    ],
    [
      'rule 2: same route under other parameter names',
      [
        entry(),
        entry({
          name: 'other',
          path: '/things/:key',
          params: z.object({ key: z.string() }),
        }),
      ],
      /duplicate route GET \/things\/:key \(also "getThing"\)/,
    ],
    [
      'rule 3: non-object body',
      [entry({ method: 'POST', body: z.string() as never })],
      /body must be a Zod object/,
    ],
    [
      'rule 4: field in two slots',
      [entry({ query: z.object({ id: z.string() }) })],
      /field "id" appears in both params and query/,
    ],
    [
      'rule 5: params missing a path parameter',
      [entry({ params: undefined })],
      /params keys \[\] must equal the path parameters \[id\]/,
    ],
    [
      'rule 5: extra params key',
      [entry({ path: '/things' })],
      /params keys \[id\] must equal the path parameters \[\]/,
    ],
    [
      'rule 6: plain number query field',
      [entry({ query: z.object({ n: z.number() }) })],
      /query field "n" must accept string input/,
    ],
    [
      'rule 6: plain array query field',
      [entry({ query: z.object({ tags: z.array(z.string()) }) })],
      /query field "tags"/,
    ],
    [
      'rule 6: queryArray of an uncoerced number',
      [entry({ query: z.object({ ns: queryArray(z.number()) }) })],
      /query field "ns"/,
    ],
    [
      'rule 7: request transform fails output mode',
      [
        entry({
          query: z.object({ s: z.string().transform((v) => v.length) }),
        }),
      ],
      /query does not convert to JSON Schema \(io: output\)/,
    ],
    [
      'rule 7: unrepresentable JSON response',
      [entry({ response: z.instanceof(Uint8Array) })],
      /response does not convert/,
    ],
    [
      'rule 8: uppercase content type',
      [entry({ contentType: 'application/JSON' })],
      /contentType must be lowercase/,
    ],
    [
      'rule 8: json in a non-JSON content type',
      [entry({ contentType: 'application/x-ndjson', response: z.string() })],
      /names json but is not JSON/,
    ],
    [
      'rule 8: non-JSON response not bytes or text',
      [entry({ contentType: 'image/png', response: z.number() })],
      /non-JSON response must be/,
    ],
  ])('rejects %s', (_label, entries, message) => {
    const found = violations(entries);
    expect(found.some((v) => message.test(v))).toBe(true);
    expect(found.every((v) => /^entry "[^"]+": /.test(v))).toBe(true);
  });

  it('reports every violation at once', () => {
    const found = violations([
      entry({ name: 'Bad', query: z.object({ n: z.number() }) }),
    ]);
    expect(found).toHaveLength(2);
    expect(() => defineCatalog([entry({ name: 'Bad' })])).toThrow(
      /Invalid endpoint catalog \(1 violation\):\n- entry "Bad"/,
    );
  });

  it.each([
    ['string', z.string()],
    ['optional string', z.string().optional()],
    ['default', z.string().default('a')],
    ['nullable', z.string().nullable()],
    ['string enum', z.enum(['a', 'b'])],
    ['string literal', z.literal('a')],
    ['coerce number', z.coerce.number()],
    ['coerce boolean', z.coerce.boolean()],
    ['stringbool', z.stringbool()],
    ['queryArray of string', queryArray(z.string())],
    [
      'optional queryArray of coerce number',
      queryArray(z.coerce.number()).optional(),
    ],
  ])('rule 6 accepts a %s query field', (_label, schema) => {
    expect(violations([entry({ query: z.object({ q: schema }) })])).toEqual([]);
  });

  it.each([
    ['number literal', z.literal(1)],
    ['number enum', z.enum({ a: 1 })],
    ['object', z.object({ a: z.string() })],
  ])('rule 6 rejects a %s query field', (_label, schema) => {
    expect(
      violations([entry({ query: z.object({ q: schema }) })]),
    ).toHaveLength(1);
  });

  it('rule 5 maps a wildcard to the params key "*"', () => {
    expect(
      violations([
        entry({ path: '/files/*', params: z.object({ '*': z.string() }) }),
      ]),
    ).toEqual([]);
  });

  it('rule 8 accepts bytes and text, exempt from rule 7', () => {
    expect(
      violations([
        entry({ contentType: 'image/png', response: z.instanceof(Uint8Array) }),
        entry({
          name: 'text',
          path: '/t/:id',
          contentType: 'text/markdown',
          response: z.string(),
        }),
      ]),
    ).toEqual([]);
  });

  it('rule 8 rejects a custom non-JSON response that is not bytes', () => {
    expect(
      violations([
        entry({ contentType: 'image/png', response: z.instanceof(Date) }),
      ]),
    ).toHaveLength(1);
  });

  it('treats +json content types as JSON', () => {
    expect(
      violations([
        entry({
          contentType: 'application/problem+json',
          response: z.instanceof(Uint8Array),
        }),
      ]),
    ).toHaveLength(1);
  });

  it('reads schemas through their core definitions, not instanceof', () => {
    // zod/mini shares Zod's core but not the classic classes, like a
    // component's own copy of Zod would.
    const params = zm.object({ id: zm.string() });
    expect(params instanceof z.ZodObject).toBe(false);
    expect(
      violations([
        entry({ params: params as unknown as CatalogEntry['params'] }),
      ]),
    ).toEqual([]);
  });

  it('rejects a component entry that duplicates a standard one', () => {
    const found = violations([
      ...standardEntries('acme', { auth: { config: 'none' } }),
      entry({ name: 'status', path: '/status', params: undefined }),
    ]);
    expect(found).toEqual([
      'entry "status": duplicate name',
      'entry "status": duplicate route GET /status (also "status")',
    ]);
  });

  it('keeps literal entry names and schema types', () => {
    const catalog = defineCatalog([
      ...standardEntries('acme', { auth: { config: 'none' } }),
      entry({ name: 'getThing' }) as CatalogEntry & { name: 'getThing' },
    ]);
    expect(catalog.entries.map((e) => e.name)).toEqual([
      'status',
      'config',
      'configApply',
      'getThing',
    ]);
    expectTypeOf(catalog.entries[0].name).toEqualTypeOf<'status'>();
    expectTypeOf<Parameters<typeof catalog.byName>[0]>().toEqualTypeOf<
      'status' | 'config' | 'configApply' | 'getThing'
    >();
    expectTypeOf(catalog.byName('configApply').body).toEqualTypeOf<
      (typeof catalog.entries)[2]['body']
    >();
  });

  describe('AuthSpec covers every jeeves-server EndpointEntry case', () => {
    // Spec 5.2 AuthSpec mapping table, one row each.
    const rows: [string, AuthSpec][] = [
      ['open route (unauthenticated: true; watcher GET /status)', 'none'],
      ['watcher API key', { schemes: [{ in: 'bearer' }] }],
      [
        'server key parameter or session cookie',
        {
          schemes: [
            { in: 'query', name: 'key' },
            { in: 'cookie', name: 'jeeves_session' },
          ],
        },
      ],
      [
        'server insiderOnly: true',
        {
          schemes: [
            { in: 'query', name: 'key' },
            { in: 'cookie', name: 'jeeves_session' },
          ],
          insiderOnly: true,
        },
      ],
      [
        'server machine endpoint (X-API-Key)',
        { schemes: [{ in: 'header', name: 'x-api-key' }] },
      ],
    ];

    it.each(rows)('%s', (_label, auth) => {
      expect(violations([entry({ auth })])).toEqual([]);
    });
  });
});
