/**
 * Shared test helper for creating mock JeevesComponentDescriptor instances.
 *
 * @remarks
 * Centralises the mock descriptor builder used across test files.
 * Provides sensible defaults that can be overridden per-test.
 */

import { z } from 'zod';

import type { JeevesComponentDescriptor } from '../component/descriptor.js';

/** Default test config schema. */
const defaultConfigSchema = z.object({
  watchPaths: z.array(z.string()).default([]),
});

/**
 * Create a mock JeevesComponentDescriptor with sensible test defaults.
 *
 * @param overrides - Partial descriptor fields to override defaults.
 * @returns A complete JeevesComponentDescriptor for testing.
 */
export function makeTestDescriptor(
  overrides: Partial<JeevesComponentDescriptor> = {},
): JeevesComponentDescriptor {
  return {
    name: 'watcher',
    version: '0.11.1',
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: defaultConfigSchema,
    configFileName: 'config.json',
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
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'content',
    ...overrides,
  } as JeevesComponentDescriptor;
}
