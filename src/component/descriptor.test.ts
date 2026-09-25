import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  getEffectiveServiceName,
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
    run: async () => {
      /* no-op for tests */
    },
    ...overrides,
  };
}

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

  it('should strip retired v0 TOOLS-writer fields', () => {
    const result = jeevesComponentDescriptorSchema.safeParse(
      makeDescriptor({
        sectionId: 'Watcher',
        refreshIntervalSeconds: 71,
        generateToolsContent: () => 'x',
        dependencies: { hard: [], soft: [] },
      }),
    );
    expect(result.success).toBe(true);
    const keys = result.success ? Object.keys(result.data) : [];
    for (const retired of [
      'sectionId',
      'refreshIntervalSeconds',
      'generateToolsContent',
      'dependencies',
    ]) {
      expect(keys).not.toContain(retired);
    }
  });

  it.each(['onConfigApply', 'customCliCommands', 'customPluginTools'])(
    'should keep an optional %s function and reject a non-function',
    (field) => {
      const result = jeevesComponentDescriptorSchema.safeParse(
        makeDescriptor({ [field]: () => undefined }),
      );
      expect(result.success).toBe(true);
      expect(
        typeof (result.data as Record<string, unknown> | undefined)?.[field],
      ).toBe('function');
      expect(
        jeevesComponentDescriptorSchema.safeParse(
          makeDescriptor({ [field]: 'nope' }),
        ).success,
      ).toBe(false);
    },
  );

  it('should require the run field', () => {
    const withoutRun: Record<string, unknown> = { ...makeDescriptor() };
    delete withoutRun['run'];
    const result = jeevesComponentDescriptorSchema.safeParse(withoutRun);
    expect(result.success).toBe(false);
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
