import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogClientError } from './clientError.js';

/** An error built from a response with these headers. */
const withHeaders = (init: Record<string, string>) =>
  new CatalogClientError('failed', { status: 503, headers: new Headers(init) });

// Parsing itself is covered by retryAfter.test.ts; these test the wiring.
describe('CatalogClientError headers and retryAfterMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the response headers', () => {
    const error = withHeaders({ 'Retry-After': '30', 'x-trace': 't1' });
    expect(error.headers?.get('retry-after')).toBe('30');
    expect(error.headers?.get('x-trace')).toBe('t1');
  });

  it('reads delta-seconds from Retry-After', () => {
    expect(withHeaders({ 'Retry-After': '30' }).retryAfterMs).toBe(30_000);
  });

  it('reads an HTTP date relative to when the error was built', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    expect(
      withHeaders({ 'Retry-After': 'Sat, 31 Oct 2026 12:01:30 GMT' })
        .retryAfterMs,
    ).toBe(90_000);
  });

  it('leaves retryAfterMs absent for an unparseable header', () => {
    expect(withHeaders({ 'Retry-After': 'soon' }).retryAfterMs).toBeUndefined();
  });

  it('leaves retryAfterMs absent without the header', () => {
    expect(withHeaders({ 'x-trace': 't1' }).retryAfterMs).toBeUndefined();
  });

  it('has neither when no response was received (status 0)', () => {
    const error = new CatalogClientError('failed', {
      status: 0,
      cause: new Error('network'),
    });
    expect(error.headers).toBeUndefined();
    expect(error.retryAfterMs).toBeUndefined();
  });
});
