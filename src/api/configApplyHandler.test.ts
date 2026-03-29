import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { JeevesComponentDescriptor } from '../component/descriptor';
import { init, resetInit } from '../init';
import { createConfigApplyHandler } from './configApplyHandler';

const testSchema = z.object({
  port: z.number().int().positive().default(1936),
  watchPaths: z.array(z.string()).default([]),
  debug: z.boolean().default(false),
});

function makeDescriptor(
  overrides: Partial<JeevesComponentDescriptor> = {},
): JeevesComponentDescriptor {
  return {
    name: 'watcher',
    version: '0.11.1',
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: testSchema,
    configFileName: 'config.json',
    initTemplate: () => ({ port: 1936, watchPaths: [], debug: false }),
    startCommand: (cp: string) => ['node', 'index.js', '-c', cp],
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'content',
    ...overrides,
  } as JeevesComponentDescriptor;
}

describe('createConfigApplyHandler', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-ca-test-${String(Date.now())}`);
    configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should create a new config file when none exists', async () => {
    const handler = createConfigApplyHandler(makeDescriptor());
    const result = await handler({
      patch: { port: 2000, watchPaths: ['/data'] },
    });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.applied).toBe(true);

    const written = JSON.parse(
      readFileSync(join(configDir, 'jeeves-watcher', 'config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(written.port).toBe(2000);
    expect(written.watchPaths).toEqual(['/data']);
  });

  it('should deep-merge with existing config', async () => {
    const existingPath = join(configDir, 'jeeves-watcher', 'config.json');
    writeFileSync(
      existingPath,
      JSON.stringify({ port: 1936, watchPaths: ['/old'], debug: true }),
    );

    const handler = createConfigApplyHandler(makeDescriptor());
    const result = await handler({
      patch: { watchPaths: ['/new'] },
    });

    expect(result.status).toBe(200);
    const written = JSON.parse(readFileSync(existingPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(written.port).toBe(1936); // preserved
    expect(written.watchPaths).toEqual(['/new']); // replaced (arrays replace)
    expect(written.debug).toBe(true); // preserved
  });

  it('should replace config when replace is true', async () => {
    const existingPath = join(configDir, 'jeeves-watcher', 'config.json');
    writeFileSync(
      existingPath,
      JSON.stringify({ port: 1936, watchPaths: ['/old'], debug: true }),
    );

    const handler = createConfigApplyHandler(makeDescriptor());
    const result = await handler({
      patch: { port: 2000 },
      replace: true,
    });

    expect(result.status).toBe(200);
    const written = JSON.parse(readFileSync(existingPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(written.port).toBe(2000);
    expect(written.watchPaths).toEqual([]); // default from schema
  });

  it('should reject invalid config patches', async () => {
    const handler = createConfigApplyHandler(makeDescriptor());
    const result = await handler({
      patch: { port: -1 },
    });

    expect(result.status).toBe(400);
    const body = result.body as Record<string, unknown>;
    expect(body.error).toContain('validation failed');
  });

  it('should call onConfigApply with merged config', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const handler = createConfigApplyHandler(
      makeDescriptor({ onConfigApply: callback }),
    );

    await handler({ patch: { port: 2000 } });

    expect(callback).toHaveBeenCalledOnce();
    const calledWith = callback.mock.calls[0][0] as Record<string, unknown>;
    expect(calledWith.port).toBe(2000);
  });

  it('should return warning when callback fails', async () => {
    const callback = vi.fn().mockRejectedValue(new Error('reload failed'));
    const handler = createConfigApplyHandler(
      makeDescriptor({ onConfigApply: callback }),
    );

    const result = await handler({ patch: { port: 2000 } });

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.applied).toBe(true);
    expect(body.warning).toContain('reload failed');
  });
});
