import { describe, expect, it } from 'vitest';

import { getErrorMessage, isTransientError } from './utils.js';

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

  it('returns false for non-transient errors', () => {
    expect(isTransientError(new Error('something else'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isTransientError('string error')).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(42)).toBe(false);
  });
});
