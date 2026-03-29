import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  getEffectiveServiceName,
  isPrime,
  jeevesComponentDescriptorSchema,
} from './descriptor';

/** Build a valid descriptor for testing, with optional overrides. */
function makeDescriptor(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'watcher',
    version: '0.11.1',
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: z.object({ watchPaths: z.array(z.string()) }),
    configFileName: 'jeeves-watcher.config.json',
    initTemplate: () => ({ watchPaths: [] }),
    startCommand: (configPath: string) => [
      'node',
      'dist/index.js',
      '-c',
      configPath,
    ],
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'Watcher tools content.',
    ...overrides,
  };
}

describe('isPrime', () => {
  it('should return false for numbers less than 2', () => {
    expect(isPrime(0)).toBe(false);
    expect(isPrime(1)).toBe(false);
    expect(isPrime(-3)).toBe(false);
  });

  it('should return true for 2', () => {
    expect(isPrime(2)).toBe(true);
  });

  it('should identify primes correctly', () => {
    expect(isPrime(61)).toBe(true);
    expect(isPrime(67)).toBe(true);
    expect(isPrime(71)).toBe(true);
    expect(isPrime(73)).toBe(true);
  });

  it('should identify non-primes correctly', () => {
    expect(isPrime(4)).toBe(false);
    expect(isPrime(60)).toBe(false);
    expect(isPrime(100)).toBe(false);
  });
});

describe('jeevesComponentDescriptorSchema', () => {
  it('should validate a correct descriptor', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(makeDescriptor());
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ name: '' }),
    );
    expect(result.success).toBe(false);
  });

  it('should reject missing version', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ version: '' }),
    );
    expect(result.success).toBe(false);
  });

  it('should reject non-prime refreshIntervalSeconds', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ refreshIntervalSeconds: 60 }),
    );
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toContain(
      'prime',
    );
  });

  it('should reject refreshIntervalSeconds of 1', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ refreshIntervalSeconds: 1 }),
    );
    expect(result.success).toBe(false);
  });

  it('should accept prime refreshIntervalSeconds', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ refreshIntervalSeconds: 67 }),
    );
    expect(result.success).toBe(true);
  });

  it('should reject non-Zod configSchema', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ configSchema: { not: 'a zod schema' } }),
    );
    expect(result.success).toBe(false);
  });

  it('should accept optional serviceName', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ serviceName: 'custom-svc' }),
    );
    expect(result.success).toBe(true);
    expect(result.success ? result.data.serviceName : undefined).toBe(
      'custom-svc',
    );
  });

  it('should accept optional dependencies', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({
        dependencies: { hard: ['watcher'], soft: [] },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should accept optional onConfigApply', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({
        onConfigApply: async () => {
          /* noop */
        },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('should accept optional customCliCommands', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ customCliCommands: () => {} }),
    );
    expect(result.success).toBe(true);
  });

  it('should accept optional customPluginTools', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ customPluginTools: () => [] }),
    );
    expect(result.success).toBe(true);
  });

  it('should reject negative defaultPort', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ defaultPort: -1 }),
    );
    expect(result.success).toBe(false);
  });

  it('should reject non-integer defaultPort', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({ defaultPort: 1936.5 }),
    );
    expect(result.success).toBe(false);
  });
});

describe('getEffectiveServiceName', () => {
  it('should default to jeeves-{name}', () => {
    const desc = jeevesComponentDescriptorSchema.parse(makeDescriptor());
    expect(getEffectiveServiceName(desc)).toBe('jeeves-watcher');
  });

  it('should use explicit serviceName when provided', () => {
    const desc = jeevesComponentDescriptorSchema.parse(
      makeDescriptor({ serviceName: 'custom-service' }),
    );
    expect(getEffectiveServiceName(desc)).toBe('custom-service');
  });
});
