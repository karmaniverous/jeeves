/**
 * Config apply failures through the standard catalog route (spec 5d.2): the
 * caller gets a caller-facing message and code; the config file path and the
 * underlying error reach the server log only.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  createConfigApplyHandler,
  JEEVES_CONFIG_READ_FAILED,
  JEEVES_CONFIG_WRITE_FAILED,
} from '../api/configApplyHandler.js';
import { createConfigQueryHandler } from '../api/configQuery.js';
import { createStatusHandler } from '../api/statusHandler.js';
import { defineCatalog } from '../catalog/defineCatalog.js';
import { standardEntries } from '../catalog/standardEntries.js';
import { makeTestDescriptor } from '../test/makeTestDescriptor.js';
import { registerCatalogRoutes } from './registerCatalogRoutes.js';
import { standardHandlers } from './standardHandlers.js';
import type { CatalogRouteLogger } from './types.js';

const catalog = defineCatalog([
  ...standardEntries('acme', { auth: { config: 'none' } }),
]);

const READ_FAILED = {
  statusCode: 500,
  code: JEEVES_CONFIG_READ_FAILED,
  error: 'Internal Server Error',
  message: 'The config file could not be read.',
};

const WRITE_FAILED = {
  statusCode: 500,
  code: JEEVES_CONFIG_WRITE_FAILED,
  error: 'Internal Server Error',
  message: 'The config file could not be written.',
};

describe('standardHandlers: config apply failures (spec 5d.2)', () => {
  let dir: string;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jeeves-std-'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * An app serving the standard entries, config apply on `configPath`.
   *
   * @param configPath - Config file path.
   * @param logger - Passed to `standardHandlers` and `registerCatalogRoutes`;
   *   when absent, Fastify logs JSON lines into `lines`.
   * @returns The app and the captured Fastify log lines.
   */
  async function build(configPath: string, logger?: CatalogRouteLogger) {
    const lines: string[] = [];
    const instance = Fastify({
      logger: logger
        ? false
        : { level: 'error', stream: { write: (l: string) => lines.push(l) } },
    });
    app = instance;
    await registerCatalogRoutes(
      instance,
      catalog,
      standardHandlers(
        {
          status: createStatusHandler({ name: 'acme', version: '1.0.0' }),
          config: createConfigQueryHandler(() => ({})),
          configApply: createConfigApplyHandler(
            makeTestDescriptor({ configSchema: z.object({ a: z.number() }) }),
            configPath,
          ),
        },
        logger ? { logger } : undefined,
      ),
      logger ? { logger } : {},
    );
    const apply = () =>
      instance.inject({
        method: 'POST',
        url: '/config/apply',
        payload: { patch: { a: 2 } },
      });
    return { apply, lines };
  }

  it('read failure: caller-facing 500; path and error in the request log only', async () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, '[1, 2]');
    const { apply, lines } = await build(path);
    const res = await apply();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(READ_FAILED);
    expect(res.body).not.toMatch(/config\.json|JSON object/);
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged).toEqual([
      expect.objectContaining({
        msg: 'Config apply: the config file could not be read',
        path,
        err: expect.objectContaining({
          message: 'config file does not contain a JSON object',
        }) as unknown,
      }),
      expect.objectContaining({
        msg: 'Error reply masked',
        statusCode: 500,
        code: JEEVES_CONFIG_READ_FAILED,
        message: READ_FAILED.message,
      }),
    ]);
  });

  it('write failure: caller-facing 500; logged to the logger option, not Fastify', async () => {
    const path = join(dir, 'missing', 'config.json');
    const logger = { warn: vi.fn(), error: vi.fn() };
    const { apply, lines } = await build(path, logger);
    const res = await apply();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual(WRITE_FAILED);
    expect(res.body).not.toMatch(/missing|ENOENT/);
    expect(lines).toEqual([]);
    expect(logger.error.mock.calls).toEqual([
      [
        {
          path,
          err: expect.objectContaining({ code: 'ENOENT' }) as unknown,
        },
        'Config apply: the config file could not be written',
      ],
      [
        {
          statusCode: 500,
          code: JEEVES_CONFIG_WRITE_FAILED,
          message: WRITE_FAILED.message,
        },
        'Error reply masked',
      ],
    ]);
  });
});
