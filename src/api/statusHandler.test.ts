import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStatusHandler } from './statusHandler';

describe('createStatusHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return standard status shape', async () => {
    const handler = createStatusHandler({
      name: 'watcher',
      version: '0.11.1',
    });
    const result = await handler();

    expect(result.status).toBe(200);
    expect(result.body.name).toBe('watcher');
    expect(result.body.version).toBe('0.11.1');
    expect(result.body.status).toBe('healthy');
    expect(typeof result.body.uptime).toBe('number');
    expect(result.body.uptime).toBeGreaterThanOrEqual(0);
    expect(result.body.health).toEqual({});
  });

  it('should increment uptime over time', async () => {
    const handler = createStatusHandler({
      name: 'runner',
      version: '0.4.1',
    });

    const r1 = await handler();
    // Wait briefly and check uptime is still >= 0
    const r2 = await handler();
    expect(r2.body.uptime).toBeGreaterThanOrEqual(r1.body.uptime);
  });

  it('should invoke getHealth callback', async () => {
    const handler = createStatusHandler({
      name: 'watcher',
      version: '0.11.1',
      getHealth: () => Promise.resolve({ indexedFiles: 1234, collections: 3 }),
    });

    const result = await handler();
    expect(result.body.health).toEqual({ indexedFiles: 1234, collections: 3 });
    expect(result.body.status).toBe('healthy');
  });

  it('getHealth throws: degraded with a caller-facing error; the error is logged (spec 5d.3)', async () => {
    vi.useFakeTimers();
    const error = new Error('Qdrant unreachable at 10.0.0.5:6333');
    const handler = createStatusHandler({
      name: 'watcher',
      version: '0.11.1',
      getHealth: () => Promise.reject(error),
    });
    const logger = { error: vi.fn() };

    const result = await handler(logger);

    expect(result).toEqual({
      status: 200,
      body: {
        name: 'watcher',
        version: '0.11.1',
        uptime: 0,
        status: 'degraded',
        health: { error: 'The health check failed.' },
      },
    });
    expect(JSON.stringify(result.body)).not.toMatch(/Qdrant|10\.0\.0\.5/);
    expect(logger.error.mock.calls).toEqual([
      [{ err: error }, 'Status: the watcher health check failed'],
    ]);
  });

  it('getHealth throws, no logger: logged to console.error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const handler = createStatusHandler({
      name: 'runner',
      version: '1.0.0',
      getHealth: () => Promise.reject(new Error('db locked')),
    });

    const result = await handler();

    expect(result.body.health).toEqual({ error: 'The health check failed.' });
    expect(consoleError.mock.calls).toEqual([
      [
        'Status: the runner health check failed',
        { err: new Error('db locked') },
      ],
    ]);
  });

  it('healthy: nothing logged', async () => {
    const handler = createStatusHandler({
      name: 'watcher',
      version: '0.11.1',
      getHealth: () => Promise.resolve({ ok: 1 }),
    });
    const logger = { error: vi.fn() };

    await handler(logger);

    expect(logger.error).not.toHaveBeenCalled();
  });
});
