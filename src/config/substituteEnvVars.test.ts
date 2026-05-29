import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { substituteEnvVars } from './substituteEnvVars';

describe('substituteEnvVars', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env['TEST_VAR'] = 'hello';
    process.env['OTHER_VAR'] = 'world';
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should substitute a single env var in a string', () => {
    expect(substituteEnvVars('${TEST_VAR}')).toBe('hello');
  });

  it('should substitute multiple env vars in one string', () => {
    expect(substituteEnvVars('${TEST_VAR} ${OTHER_VAR}')).toBe('hello world');
  });

  it('should substitute env vars at arbitrary depth in nested objects', () => {
    const input = {
      a: {
        b: {
          c: '${TEST_VAR}',
        },
      },
    };
    expect(substituteEnvVars(input)).toEqual({
      a: { b: { c: 'hello' } },
    });
  });

  it('should substitute env vars in array elements', () => {
    const input = ['${TEST_VAR}', '${OTHER_VAR}', 'static'];
    expect(substituteEnvVars(input)).toEqual(['hello', 'world', 'static']);
  });

  it('should leave missing env vars untouched', () => {
    expect(substituteEnvVars('${DOES_NOT_EXIST}')).toBe('${DOES_NOT_EXIST}');
  });

  it('should pass through non-string values unchanged', () => {
    expect(substituteEnvVars(42)).toBe(42);
    expect(substituteEnvVars(true)).toBe(true);
    expect(substituteEnvVars(null)).toBe(null);
  });

  it('should return a new object without mutating the input', () => {
    const input = {
      host: '${TEST_VAR}',
      nested: { port: '${OTHER_VAR}' },
    };
    const frozen = JSON.parse(JSON.stringify(input));

    const result = substituteEnvVars(input);

    // Result has substituted values
    expect(result).toEqual({ host: 'hello', nested: { port: 'world' } });
    // Input is unchanged
    expect(input).toEqual(frozen);
    // Result is a different reference
    expect(result).not.toBe(input);
  });

  it('should not recurse into class instances', () => {
    class Config {
      value = '${TEST_VAR}';
    }

    const instance = new Config();
    const result = substituteEnvVars(instance);

    expect(result).toBe(instance);
    expect(result.value).toBe('${TEST_VAR}');
  });
});
