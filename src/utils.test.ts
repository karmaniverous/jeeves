import { describe, expect, it } from 'vitest';

import { getErrorMessage } from './utils.js';

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
