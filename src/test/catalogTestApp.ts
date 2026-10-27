/**
 * Reusable catalog test app (dev-plan step 4, reused by steps 5-7).
 *
 * @remarks
 * A catalog exercising every route-registration path (standard entries,
 * path/query/body slots, a wildcard, non-JSON bytes and text, a handler
 * returning a bad response) with handlers, and a factory building a Fastify
 * app with an optional bearer-auth hook on the root app.
 *
 * @module
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createConfigApplyHandler } from '../api/configApplyHandler.js';
import { createConfigQueryHandler } from '../api/configQuery.js';
import { createStatusHandler } from '../api/statusHandler.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { queryArray } from '../catalog/queryArray.js';
import { standardEntries } from '../catalog/standardEntries.js';
import { registerCatalogRoutes } from '../fastify/registerCatalogRoutes.js';
import { standardHandlers } from '../fastify/standardHandlers.js';
import type {
  CatalogHandlers,
  RegisterCatalogRoutesOptions,
} from '../fastify/types.js';
import { makeTestDescriptor } from './makeTestDescriptor.js';

/** Bearer key the test auth hook accepts. */
export const TEST_KEY = 'test-key';

/** PNG-ish bytes the `render` entry returns. */
export const TEST_BYTES = new Uint8Array([137, 80, 78, 71]);

const bearer = { schemes: [{ in: 'bearer' }] } as const;

/** The test catalog. */
export const testCatalog = defineCatalog([
  ...standardEntries('acme', { auth: { config: bearer } }),
  {
    name: 'getThing',
    method: 'GET',
    path: '/things/:id',
    description: 'Get a thing.',
    params: z.object({ id: z.string() }),
    query: z.object({
      tags: queryArray(z.coerce.number()).optional(),
      verbose: z.stringbool().optional(),
    }),
    response: z.object({
      id: z.string(),
      tags: z.array(z.number()),
      verbose: z.boolean(),
    }),
    auth: 'none',
    kind: 'read',
  },
  {
    name: 'createThing',
    method: 'POST',
    path: '/things',
    description: 'Create a thing.',
    body: z.object({ name: z.string().min(1), size: z.number().optional() }),
    response: z.object({ id: z.string(), name: z.string() }),
    auth: bearer,
    kind: 'write',
  },
  {
    name: 'deleteThing',
    method: 'DELETE',
    path: '/things/:id',
    description: 'Delete a thing.',
    params: z.object({ id: z.string() }),
    response: z.object({ deleted: z.boolean() }),
    auth: bearer,
    kind: 'destructive',
  },
  {
    name: 'readFile',
    method: 'GET',
    path: '/files/*',
    description: 'Read a file path.',
    params: z.object({ '*': z.string() }),
    response: z.object({ path: z.string() }),
    auth: 'none',
    kind: 'read',
  },
  {
    name: 'render',
    method: 'GET',
    path: '/render',
    description: 'Render an image.',
    response: z.instanceof(Uint8Array),
    contentType: 'image/png',
    auth: 'none',
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
  {
    name: 'broken',
    method: 'GET',
    path: '/broken',
    description: 'Returns a body that breaks its schema.',
    response: z.object({ count: z.number() }),
    auth: 'none',
    kind: 'read',
  },
]);

/** Config file the standard handlers read and write. */
export const TEST_CONFIG_PATH = join(
  mkdtempSync(join(tmpdir(), 'jeeves-catalog-')),
  'config.json',
);

/** Reset the config file to `{ "a": 1 }`. */
export function resetTestConfig(): void {
  writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ a: 1 }));
}
resetTestConfig();

/** Handlers for {@link testCatalog}. */
export const testHandlers: CatalogHandlers<typeof testCatalog> = {
  ...standardHandlers({
    status: createStatusHandler({ name: 'acme', version: '1.0.0' }),
    config: createConfigQueryHandler(
      () =>
        JSON.parse(readFileSync(TEST_CONFIG_PATH, 'utf8')) as Record<
          string,
          unknown
        >,
    ),
    configApply: createConfigApplyHandler(
      makeTestDescriptor({ configSchema: z.object({ a: z.number() }) }),
      TEST_CONFIG_PATH,
    ),
  }),
  getThing: ({ params, query }) =>
    Promise.resolve(
      params.id === 'missing'
        ? { status: 404, body: { error: 'Not found' } }
        : {
            status: 200,
            body: {
              id: params.id,
              tags: query.tags ?? [],
              verbose: query.verbose ?? false,
            },
          },
    ),
  createThing: ({ body }) =>
    Promise.resolve({
      status: 201,
      body: { id: 'new', name: body.name },
      headers: { location: '/things/new' },
    }),
  deleteThing: () => Promise.resolve({ status: 200, body: { deleted: true } }),
  readFile: ({ params }) =>
    Promise.resolve({ status: 200, body: { path: params['*'] } }),
  render: () => Promise.resolve({ status: 200, body: TEST_BYTES }),
  readme: () => Promise.resolve({ status: 200, body: '# Acme\n' }),
  broken: () =>
    Promise.resolve({
      status: 200,
      body: { count: 'many' } as unknown as { count: number },
    }),
};

/** Options for {@link buildTestApp}. */
export interface TestAppOptions extends RegisterCatalogRoutesOptions {
  /** Add a bearer-auth `onRequest` hook to the root app first. */
  auth?: boolean;
}

/**
 * A Fastify app serving {@link testCatalog}.
 *
 * @param options - Route options, plus `auth`.
 * @returns The ready app (call `close` when done).
 */
export async function buildTestApp(
  options: TestAppOptions = {},
): Promise<FastifyInstance> {
  const { auth, ...routeOptions } = options;
  const app = Fastify({ logger: false });
  if (auth) {
    const protectedRoutes = new Set(
      testCatalog.entries
        .filter((e) => e.auth !== 'none')
        .map((e) => `${e.method} ${e.path}`),
    );
    app.addHook('onRequest', async (request, reply) => {
      const route = `${request.method} ${request.routeOptions.url ?? ''}`;
      if (
        protectedRoutes.has(route) &&
        request.headers.authorization !== `Bearer ${TEST_KEY}`
      )
        await reply.status(401).send({ error: 'Unauthorized' });
    });
  }
  await registerCatalogRoutes(app, testCatalog, testHandlers, routeOptions);
  await app.ready();
  return app;
}
