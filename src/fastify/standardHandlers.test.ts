/**
 * Config apply and status failures through the standard catalog routes
 * (spec 5d.2, 5d.3): the caller gets caller-facing text; the config file
 * path and the underlying error reach the server log only.
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

/** What makes the app's status and config apply fail. */
interface Failures {
  /** The status handler's `getHealth`. */
  getHealth?: () => Promise<Record<string, unknown>>;
  /** The descriptor's `onConfigApply`. */
  onConfigApply?: (config: Record<string, unknown>) => Promise<void>;
}

describe('standardHandlers: config apply and status failures (spec 5d.2, 5d.3)', () => {
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
   * @param failures - Throwing `getHealth` / `onConfigApply`.
   * @returns The app and the captured Fastify log lines.
   */
  async function build(
    configPath: string,
    logger?: CatalogRouteLogger,
    failures: Failures = {},
  ) {
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
          status: createStatusHandler({
            name: 'acme',
            version: '1.0.0',
            getHealth: failures.getHealth,
          }),
          config: createConfigQueryHandler(() => ({})),
          configApply: createConfigApplyHandler(
            makeTestDescriptor({
              configSchema: z.object({ a: z.number() }),
              onConfigApply: failures.onConfigApply,
            }),
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
    const status = () => instance.inject({ method: 'GET', url: '/status' });
    return { apply, status, lines };
  }

  /**
   * Parsed Fastify JSON log lines.
   *
   * @param lines - Captured lines.
   * @returns One object per line.
   */
  const parse = (lines: string[]) =>
    lines.map((l) => JSON.parse(l) as Record<string, unknown>);

  it('onConfigApply throws: 200 with the caller-facing warning; path and error in the request log only', async () => {
    const path = join(dir, 'config.json');
    const { apply, lines } = await build(path, undefined, {
      onConfigApply: () => Promise.reject(new Error('reload: secret detail')),
    });
    const res = await apply();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      applied: true,
      warning: 'The config was written but could not be applied.',
      config: { a: 2 },
    });
    expect(res.body).not.toMatch(/secret|reload|config\.json/);
    expect(parse(lines)).toEqual([
      expect.objectContaining({
        level: 50,
        msg: 'Config apply: the config was written but could not be applied',
        path,
        err: expect.objectContaining({
          message: 'reload: secret detail',
        }) as unknown,
      }),
    ]);
  });

  it('health check throws: degraded with the caller-facing error; error in the request log only', async () => {
    const { status, lines } = await build(join(dir, 'config.json'), undefined, {
      getHealth: () => Promise.reject(new Error('Qdrant at 10.0.0.5 down')),
    });
    const res = await status();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      name: 'acme',
      version: '1.0.0',
      uptime: expect.any(Number) as unknown,
      status: 'degraded',
      health: { error: 'The health check failed.' },
    });
    expect(res.body).not.toMatch(/Qdrant|10\.0\.0\.5/);
    expect(parse(lines)).toEqual([
      expect.objectContaining({
        level: 50,
        msg: 'Status: the acme health check failed',
        err: expect.objectContaining({
          message: 'Qdrant at 10.0.0.5 down',
        }) as unknown,
      }),
    ]);
  });

  it('health check throws: logged to the logger option, not Fastify', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const error = new Error('Qdrant down');
    const { status, lines } = await build(join(dir, 'config.json'), logger, {
      getHealth: () => Promise.reject(error),
    });
    const res = await status();
    expect(res.json<{ health: unknown }>().health).toEqual({
      error: 'The health check failed.',
    });
    expect(lines).toEqual([]);
    expect(logger.error.mock.calls).toEqual([
      [{ err: error }, 'Status: the acme health check failed'],
    ]);
  });

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
