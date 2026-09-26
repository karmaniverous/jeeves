import { describe, expect, it } from 'vitest';

import {
  getErrorCode,
  getErrorMessage,
  isRecord,
  isTransientError,
  parseJson,
} from './utils.js';

describe('parseJson', () => {
  it('parses JSON', () => {
    expect(parseJson('{"a":1}', 'bad')).toEqual({ a: 1 });
  });

  it('throws the given message with the parse error as cause', () => {
    let error: unknown;
    try {
      parseJson('nope', 'Unexpected output');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Unexpected output');
    expect((error as Error).cause).toBeInstanceOf(SyntaxError);
  });
});

describe('isRecord', () => {
  it.each([
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    [null, false],
    [undefined, false],
    ['x', false],
  ])('%j → %s', (value, expected) => {
    expect(isRecord(value)).toBe(expected);
  });
});

describe('getErrorCode', () => {
  it('returns the code of a Node-style error', () => {
    expect(getErrorCode(Object.assign(new Error('x'), { code: 'EPERM' }))).toBe(
      'EPERM',
    );
  });

  it('returns undefined without a code', () => {
    expect(getErrorCode(new Error('x'))).toBeUndefined();
    expect(getErrorCode('EPERM')).toBeUndefined();
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe(
      'something broke',
    );
  });

  it('extracts message from Error subclasses', () => {
    expect(getErrorMessage(new TypeError('wrong type'))).toBe('wrong type');
  });

  it('converts strings to themselves', () => {
    expect(getErrorMessage('plain string error')).toBe('plain string error');
  });

  it('stringifies numbers', () => {
    expect(getErrorMessage(42)).toBe('42');
  });

  it('stringifies null', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('stringifies undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('stringifies objects', () => {
    expect(getErrorMessage({ code: 'ENOENT' })).toBe('[object Object]');
  });
});

describe('isTransientError', () => {
  it('returns true for ECONNRESET error code', () => {
    const err = new Error('connection reset');
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    expect(isTransientError(err)).toBe(true);
  });

  it('returns true for ETIMEDOUT error code', () => {
    const err = new Error('timed out');
    (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
    expect(isTransientError(err)).toBe(true);
  });

  it('returns true for UND_ERR_CONNECT_TIMEOUT error code', () => {
    const err = new Error('connect timeout');
    (err as NodeJS.ErrnoException).code = 'UND_ERR_CONNECT_TIMEOUT';
    expect(isTransientError(err)).toBe(true);
  });

  it('returns true for AbortError by name', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(isTransientError(err)).toBe(true);
  });

  it('returns true when cause has transient code', () => {
    const cause = new Error('inner');
    (cause as NodeJS.ErrnoException).code = 'ECONNRESET';
    const err = new Error('fetch failed', { cause });
    expect(isTransientError(err)).toBe(true);
  });

  it('returns true for deeply nested transient cause', () => {
    const root = new Error('read ECONNRESET');
    (root as NodeJS.ErrnoException).code = 'ECONNRESET';
    const mid = new Error('socket hang up', { cause: root });
    const outer = new TypeError('fetch failed', { cause: mid });
    expect(isTransientError(outer)).toBe(true);
  });

  it('returns false for non-transient errors', () => {
    expect(isTransientError(new Error('something else'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientError('string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(42)).toBe(false);
  });
});
