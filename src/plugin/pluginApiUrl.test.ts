import { describe, expect, it, vi } from 'vitest';

import {
  pluginToolsetOptionsSchema,
  resolvePluginApiUrl,
} from './pluginApiUrl';

describe('resolvePluginApiUrl', () => {
  it.each([
    ['a custom URL', 'http://10.0.0.5:2936', 'http://10.0.0.5:2936'],
    ['trailing slashes stripped', 'http://h:1//', 'http://h:1'],
    ['surrounding whitespace trimmed', '  http://h:1 ', 'http://h:1'],
    ['unset', undefined, 'http://127.0.0.1:1936'],
    ['empty', '', 'http://127.0.0.1:1936'],
  ])('%s', (_label, apiUrl, expected) => {
    expect(resolvePluginApiUrl(apiUrl, 1936)).toBe(expected);
  });

  it('evaluates a resolver on every call', () => {
    const resolver = vi
      .fn<() => string | undefined>()
      .mockReturnValueOnce('http://a:1')
      .mockReturnValueOnce(undefined);
    expect(resolvePluginApiUrl(resolver, 1937)).toBe('http://a:1');
    expect(resolvePluginApiUrl(resolver, 1937)).toBe('http://127.0.0.1:1937');
    expect(resolver).toHaveBeenCalledTimes(2);
  });
});

describe('pluginToolsetOptionsSchema', () => {
  it('accepts a string, a function, or nothing', () => {
    const fn = (): string => 'http://x';
    expect(pluginToolsetOptionsSchema.parse({ apiUrl: 'http://x' })).toEqual({
      apiUrl: 'http://x',
    });
    expect(pluginToolsetOptionsSchema.parse({ apiUrl: fn }).apiUrl).toBe(fn);
    expect(pluginToolsetOptionsSchema.parse({})).toEqual({});
  });

  it('rejects other types', () => {
    expect(() => pluginToolsetOptionsSchema.parse({ apiUrl: 42 })).toThrow(
      /apiUrl must be a string or a function/,
    );
  });
});
