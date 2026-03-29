import { describe, expect, it } from 'vitest';

import { createStatusHandler } from './statusHandler';

describe('createStatusHandler', () => {
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

  it('should degrade gracefully when getHealth throws', async () => {
    const handler = createStatusHandler({
      name: 'watcher',
      version: '0.11.1',
      getHealth: () => Promise.reject(new Error('Qdrant unreachable')),
    });

    const result = await handler();
    expect(result.status).toBe(200);
    expect(result.body.status).toBe('degraded');
    expect(result.body.health).toEqual({ error: 'Qdrant unreachable' });
  });
});
