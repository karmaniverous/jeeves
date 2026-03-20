import { describe, expect, it } from 'vitest';

import { connectionFail, fail, ok } from './results.js';

describe('ok', () => {
  it('serialises data as JSON with 2-space indent', () => {
    const result = ok({ foo: 'bar', n: 42 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual({ foo: 'bar', n: 42 });
  });

  it('handles null and primitives', () => {
    expect(JSON.parse(ok(null).content[0].text)).toBeNull();
    expect(JSON.parse(ok(123).content[0].text)).toBe(123);
    expect(JSON.parse(ok('hello').content[0].text)).toBe('hello');
  });
});

describe('fail', () => {
  it('extracts message from Error', () => {
    const result = fail(new Error('boom'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: boom');
  });

  it('converts string to error message', () => {
    const result = fail('something broke');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: something broke');
  });

  it('converts non-string/non-Error to string', () => {
    const result = fail(42);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: 42');
  });
});

describe('connectionFail', () => {
  it('detects ECONNREFUSED and returns actionable message', () => {
    const error = new Error('fetch failed');
    (error as unknown as { cause: { code: string } }).cause = {
      code: 'ECONNREFUSED',
    };

    const result = connectionFail(
      error,
      'http://localhost:1936',
      'jeeves-watcher-openclaw',
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Service not reachable at http://localhost:1936',
    );
    expect(result.content[0].text).toContain(
      'plugins.entries.jeeves-watcher-openclaw.config.apiUrl',
    );
  });

  it('detects ENOTFOUND', () => {
    const error = new Error('fetch failed');
    (error as unknown as { cause: { code: string } }).cause = {
      code: 'ENOTFOUND',
    };

    const result = connectionFail(error, 'http://badhost:1234', 'my-plugin');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Service not reachable');
  });

  it('detects ETIMEDOUT', () => {
    const error = new Error('fetch failed');
    (error as unknown as { cause: { code: string } }).cause = {
      code: 'ETIMEDOUT',
    };

    const result = connectionFail(error, 'http://slow:1234', 'my-plugin');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Service not reachable');
  });

  it('falls back to fail() for non-connection errors', () => {
    const error = new Error('some other error');

    const result = connectionFail(error, 'http://localhost:1234', 'my-plugin');
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: some other error');
  });

  it('falls back to fail() when error has no cause', () => {
    const result = connectionFail(
      new Error('no cause'),
      'http://localhost:1234',
      'my-plugin',
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: no cause');
  });

  it('falls back to fail() for non-Error values', () => {
    const result = connectionFail(
      'string error',
      'http://localhost:1234',
      'my-plugin',
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: string error');
  });
});
