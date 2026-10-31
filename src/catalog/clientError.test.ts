import { afterEach, describe, expect, it, vi } from 'vitest';

import { CatalogClientError } from './clientError.js';

/** An error built from a response with these headers. */
const withHeaders = (init: Record<string, string>) =>
  new CatalogClientError('failed', { status: 503, headers: new Headers(init) });

describe('CatalogClientError headers and retryAfterMs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the response headers', () => {
    const error = withHeaders({ 'Retry-After': '30', 'x-trace': 't1' });
    expect(error.headers?.get('retry-after')).toBe('30');
    expect(error.headers?.get('x-trace')).toBe('t1');
  });

  it.each([
    ['0', 0],
    ['30', 30_000],
    [' 7 ', 7000],
  ])('reads delta-seconds %j as %d ms', (value, ms) => {
    expect(withHeaders({ 'Retry-After': value }).retryAfterMs).toBe(ms);
  });

  it('reads an HTTP date relative to when the error was built', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    expect(
      withHeaders({ 'Retry-After': 'Sat, 31 Oct 2026 12:01:30 GMT' })
        .retryAfterMs,
    ).toBe(90_000);
  });

  it.each([['Saturday, 31-Oct-26 12:01:30 GMT'], ['Sat Oct 31 12:01:30 2026']])(
    'reads the obsolete HTTP-date form %j',
    (value) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
      expect(
        withHeaders({ 'Retry-After': value }).retryAfterMs,
      ).toBeGreaterThan(0);
    },
  );

  it('never returns a negative wait for a past date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    expect(
      withHeaders({ 'Retry-After': 'Sat, 31 Oct 2026 11:00:00 GMT' })
        .retryAfterMs,
    ).toBe(0);
  });

  it.each([['soon'], ['-5'], ['1.5'], ['']])(
    'leaves retryAfterMs absent for unparseable %j',
    (value) => {
      expect(
        withHeaders({ 'Retry-After': value }).retryAfterMs,
      ).toBeUndefined();
    },
  );

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
