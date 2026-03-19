import { describe, expect, it } from 'vitest';

import { createConfigQueryHandler } from './configQuery.js';

const sampleConfig = {
  server: { port: 1934, host: 'localhost' },
  plugins: {
    entries: {
      'jeeves-watcher-openclaw': {
        config: { apiUrl: 'http://localhost:1936' },
      },
    },
  },
  features: ['search', 'export', 'share'],
};

describe('createConfigQueryHandler', () => {
  const handler = createConfigQueryHandler(() => sampleConfig);

  it('returns full config when no path is given', async () => {
    const result = await handler({});
    expect(result.status).toBe(200);
    expect(result.body).toEqual(sampleConfig);
  });

  it('returns full config when path is undefined', async () => {
    const result = await handler({ path: undefined });
    expect(result.status).toBe(200);
    expect(result.body).toEqual(sampleConfig);
  });

  it('returns matching results for valid JSONPath', async () => {
    const result = await handler({ path: '$.server.port' });
    expect(result.status).toBe(200);

    const body = result.body as { result: unknown[]; count: number };
    expect(body.result).toEqual([1934]);
    expect(body.count).toBe(1);
  });

  it('returns multiple results for array query', async () => {
    const result = await handler({ path: '$.features[*]' });
    expect(result.status).toBe(200);

    const body = result.body as { result: unknown[]; count: number };
    expect(body.result).toEqual(['search', 'export', 'share']);
    expect(body.count).toBe(3);
  });

  it('returns empty array for non-matching path', async () => {
    const result = await handler({ path: '$.nonexistent.path' });
    expect(result.status).toBe(200);

    const body = result.body as { result: unknown[]; count: number };
    expect(body.result).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('returns nested objects', async () => {
    const result = await handler({
      path: '$.plugins.entries.jeeves-watcher-openclaw.config',
    });
    expect(result.status).toBe(200);

    const body = result.body as { result: unknown[]; count: number };
    expect(body.result).toEqual([{ apiUrl: 'http://localhost:1936' }]);
    expect(body.count).toBe(1);
  });

  it('returns 400 for invalid JSONPath expression', async () => {
    const result = await handler({ path: '$[?(' });
    expect(result.status).toBe(400);

    const body = result.body as { error: string };
    expect(body.error).toBeDefined();
    expect(typeof body.error).toBe('string');
  });

  it('calls getConfig on each invocation', async () => {
    let counter = 0;
    const dynamicHandler = createConfigQueryHandler(() => {
      counter++;
      return { count: counter };
    });

    const first = await dynamicHandler({ path: '$.count' });
    const second = await dynamicHandler({ path: '$.count' });

    const firstBody = first.body as { result: number[] };
    const secondBody = second.body as { result: number[] };

    expect(firstBody.result[0]).toBe(1);
    expect(secondBody.result[0]).toBe(2);
  });
});
