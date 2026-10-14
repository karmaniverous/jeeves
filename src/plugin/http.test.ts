import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchJson,
  fetchWithTimeout,
  postJson,
} from './http.js';

describe('fetchWithTimeout', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns response on success', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await fetchWithTimeout('http://localhost:1234/status', 3000);

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1234/status',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('passes init options merged with signal', async () => {
    const mockResponse = { ok: true, status: 200 };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await fetchWithTimeout('http://localhost:1234/api', 5000, {
      method: 'POST',
      headers: { 'X-Custom': 'value' },
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1234/api',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-Custom': 'value' },
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('aborts on timeout', async () => {
    vi.useFakeTimers();

    vi.mocked(fetch).mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        }),
    );

    const promise = fetchWithTimeout('http://localhost:1234/slow', 1000);

    vi.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow('aborted');

    vi.useRealTimers();
  });

  it('clears timeout after successful fetch', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const mockResponse = { ok: true, status: 200 };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await fetchWithTimeout('http://localhost:1234/api', 3000);

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe('fetchJson', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed JSON on success', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ data: 'hello' }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await fetchJson('http://localhost:1234/api');

    expect(result).toEqual({ data: 'hello' });
    expect(fetch).toHaveBeenCalledWith('http://localhost:1234/api', {
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('throws on non-OK response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await expect(fetchJson('http://localhost:1234/missing')).rejects.toThrow(
      'HTTP 404: Not found',
    );
  });

  it('passes init options through', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve(null),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const init: RequestInit = {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    };
    await fetchJson('http://localhost:1234/api', init);

    expect(fetch).toHaveBeenCalledWith('http://localhost:1234/api', {
      ...init,
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('uses the caller signal instead of the default timeout', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    } as Response);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const signal = new AbortController().signal;

    await fetchJson('http://localhost:1234/api', { signal }, { timeoutMs: 5 });

    expect(fetch).toHaveBeenCalledWith('http://localhost:1234/api', { signal });
    expect(timeoutSpy).not.toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });

  it('applies the default timeout', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    } as Response);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    await fetchJson('http://localhost:1234/api');

    expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_FETCH_TIMEOUT_MS);
    timeoutSpy.mockRestore();
  });

  it('rejects when a service never answers within timeoutMs', async () => {
    vi.mocked(fetch).mockImplementation(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );

    await expect(
      fetchJson('http://localhost:1234/stalled', undefined, { timeoutMs: 20 }),
    ).rejects.toThrow(/timed out|aborted/i);
  });
});

describe('postJson', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends POST with JSON body', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const result = await postJson('http://localhost:1234/api', {
      key: 'value',
    });

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith('http://localhost:1234/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('passes timeoutMs through', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(null),
    } as Response);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    await postJson('http://localhost:1234/api', {}, { timeoutMs: 1234 });

    expect(timeoutSpy).toHaveBeenCalledWith(1234);
    timeoutSpy.mockRestore();
  });

  it('throws on non-OK POST response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await expect(
      postJson('http://localhost:1234/api', { data: 1 }),
    ).rejects.toThrow('HTTP 500: Internal Server Error');
  });
});
