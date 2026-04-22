import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAsyncContentCache } from './createAsyncContentCache.js';

describe('createAsyncContentCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns placeholder before first fetch resolves', () => {
    const getContent = createAsyncContentCache({
      fetch: () => Promise.resolve('live data'),
      placeholder: 'loading...',
    });

    expect(getContent()).toBe('loading...');
  });

  it('returns fetched content after resolution', async () => {
    const getContent = createAsyncContentCache({
      fetch: () => Promise.resolve('live data'),
      placeholder: 'loading...',
    });

    // First call triggers fetch
    getContent();

    // Let the microtask (Promise resolution) complete
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    expect(getContent()).toBe('live data');
  });

  it('retains previous value on fetch failure', async () => {
    let callCount = 0;
    const getContent = createAsyncContentCache({
      fetch: () => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('network error'));
        return Promise.resolve(`data-${String(callCount)}`);
      },
      placeholder: 'loading...',
      onError: () => {
        // suppress warning in test
      },
    });

    // First call succeeds
    getContent();
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();
    expect(getContent()).toBe('data-1');

    // Second call (fetch #2) fails — wait for it to complete
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    // Value retained from first successful fetch
    expect(getContent()).toBe('data-1');
  });

  it('uses default placeholder when none specified', () => {
    const getContent = createAsyncContentCache({
      fetch: () => Promise.resolve('data'),
    });

    expect(getContent()).toBe('> Initializing...');
  });

  it('does not start concurrent fetches', async () => {
    let fetchCount = 0;
    let resolvePromise: ((v: string) => void) | undefined;

    const getContent = createAsyncContentCache({
      fetch: () => {
        fetchCount++;
        return new Promise<string>((resolve) => {
          resolvePromise = resolve;
        });
      },
      placeholder: 'loading...',
    });

    // Two rapid calls
    getContent();
    getContent();

    expect(fetchCount).toBe(1);

    // Resolve the pending fetch
    resolvePromise!('data');
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    expect(getContent()).toBe('data');
    // Now a new fetch starts
    expect(fetchCount).toBe(2);
  });

  it('calls onError when fetch throws', async () => {
    const errors: unknown[] = [];
    const getContent = createAsyncContentCache({
      fetch: () => Promise.reject(new Error('boom')),
      onError: (err) => {
        errors.push(err);
      },
    });

    getContent();
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
  });

  it('default handler logs transient errors as concise warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const err = new Error('fetch failed');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';

    const getContent = createAsyncContentCache({
      fetch: () => Promise.reject(err),
    });

    getContent();
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain('transient error');
    expect(msg).toContain('fetch failed');

    warnSpy.mockRestore();
  });

  it('default handler logs unexpected errors with full details', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const getContent = createAsyncContentCache({
      fetch: () => Promise.reject(new Error('unexpected crash')),
    });

    getContent();
    await vi.advanceTimersToNextTimerAsync();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledOnce();
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain('cache refresh failed');

    warnSpy.mockRestore();
  });
});
