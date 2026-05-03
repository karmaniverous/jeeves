import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cleanupEscalation.js', () => ({
  requestCleanupSession: vi.fn().mockResolvedValue(true),
}));

import { init, resetInit } from '../init';
import { withWorkspaceLock } from '../managed/fileOps.js';
import { parseManaged } from '../managed/parseManaged';
import { makeTestDescriptor } from '../test/makeTestDescriptor';
import { requestCleanupSession } from './cleanupEscalation.js';
import { createComponentWriter } from './createComponentWriter';

function makeDescriptor(
  overrides: Parameters<typeof makeTestDescriptor>[0] = {},
) {
  return makeTestDescriptor({
    generateToolsContent: () => 'Watcher content.',
    ...overrides,
  });
}

async function readBundledContent(fileName: string): Promise<string> {
  const { dirname, join: joinPath } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    joinPath(thisDir, '..', '..', 'content', fileName),
    'utf-8',
  );
}

describe('createComponentWriter', () => {
  let testDir: string;
  let workspaceDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-cw-test-${String(Date.now())}`);
    workspaceDir = join(testDir, 'workspace');
    configDir = join(testDir, 'config');
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    init({ workspacePath: workspaceDir, configRoot: configDir });
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should reject non-prime interval', () => {
    expect(() =>
      createComponentWriter(makeDescriptor({ refreshIntervalSeconds: 60 })),
    ).toThrow('prime');
  });

  it('should reject interval of 1', () => {
    expect(() =>
      createComponentWriter(makeDescriptor({ refreshIntervalSeconds: 1 })),
    ).toThrow(/prime/);
  });

  it('should accept prime interval', () => {
    expect(() =>
      createComponentWriter(makeDescriptor({ refreshIntervalSeconds: 67 })),
    ).not.toThrow();
  });

  it('should reject empty name', () => {
    expect(() => createComponentWriter(makeDescriptor({ name: '' }))).toThrow(
      'non-empty string',
    );
  });

  it('should reject empty version', () => {
    expect(() =>
      createComponentWriter(makeDescriptor({ version: '' })),
    ).toThrow('non-empty string');
  });

  it('should reject empty sectionId', () => {
    expect(() =>
      createComponentWriter(makeDescriptor({ sectionId: '' })),
    ).toThrow('non-empty string');
  });

  it('should derive componentConfigDir from component name', () => {
    const writer = createComponentWriter(makeDescriptor());
    expect(writer.componentConfigDir).toMatch(/jeeves-watcher$/);
  });

  describe('ComponentWriter lifecycle', () => {
    it('should start and stop', () => {
      vi.useFakeTimers();
      const writer = createComponentWriter(makeDescriptor());
      vi.spyOn(writer, 'cycle').mockResolvedValue(undefined);

      expect(writer.isRunning).toBe(false);
      writer.start();
      expect(writer.isRunning).toBe(true);
      writer.stop();
      expect(writer.isRunning).toBe(false);
      vi.useRealTimers();
    });

    it('should not start twice', () => {
      vi.useFakeTimers();
      const writer = createComponentWriter(makeDescriptor());
      vi.spyOn(writer, 'cycle').mockResolvedValue(undefined);

      writer.start();
      writer.start(); // Should be a no-op
      expect(writer.isRunning).toBe(true);
      writer.stop();
      vi.useRealTimers();
    });

    it('should delay initial cycle with jitter via setTimeout', () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const writer = createComponentWriter(
        makeDescriptor({ refreshIntervalSeconds: 67 }),
      );
      vi.spyOn(writer, 'cycle').mockResolvedValue(undefined);

      writer.start();

      // setTimeout should have been called with a delay between 0 and intervalMs
      const jitterCall = setTimeoutSpy.mock.calls.find(
        (call) => typeof call[1] === 'number',
      );
      expect(jitterCall).toBeDefined();
      const delay = jitterCall?.[1] as number;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(67 * 1000);

      writer.stop();
      vi.useRealTimers();
    });

    it('should reschedule correctly through multiple cycles', async () => {
      vi.useFakeTimers();
      const writer = createComponentWriter(
        makeDescriptor({ refreshIntervalSeconds: 67 }),
      );
      const cycleSpy = vi.spyOn(writer, 'cycle').mockResolvedValue(undefined);

      writer.start();

      // Advance past jitter (max 67s)
      await vi.advanceTimersByTimeAsync(67_000);
      // First cycle should fire
      expect(cycleSpy).toHaveBeenCalledTimes(1);

      // Advance past interval for second cycle
      await vi.advanceTimersByTimeAsync(67_000);
      expect(cycleSpy).toHaveBeenCalledTimes(2);

      // Advance past interval for third cycle
      await vi.advanceTimersByTimeAsync(67_000);
      expect(cycleSpy).toHaveBeenCalledTimes(3);

      writer.stop();
      vi.useRealTimers();
    });

    it('should stop preventing further scheduling', async () => {
      vi.useFakeTimers();
      const writer = createComponentWriter(
        makeDescriptor({ refreshIntervalSeconds: 67 }),
      );
      const cycleSpy = vi.spyOn(writer, 'cycle').mockResolvedValue(undefined);

      writer.start();

      // Advance past jitter to first cycle
      await vi.advanceTimersByTimeAsync(67_000);
      expect(cycleSpy).toHaveBeenCalledTimes(1);

      writer.stop();

      // Advance past several intervals — no more cycles
      await vi.advanceTimersByTimeAsync(200_000);
      expect(cycleSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should not re-enter while a cycle is already running', async () => {
      const writer = createComponentWriter(makeDescriptor());
      let resolveCycle: (() => void) | undefined;
      const runCycleSpy = vi
        .spyOn(
          writer as object as { runCycle: () => Promise<void> },
          'runCycle',
        )
        .mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              resolveCycle = resolve;
            }),
        );

      const firstCycle = writer.cycle();
      const secondCycle = writer.cycle();

      expect(runCycleSpy).toHaveBeenCalledTimes(1);
      expect(writer.isRunning).toBe(true);

      resolveCycle?.();
      await Promise.all([firstCycle, secondCycle]);
      expect(writer.isRunning).toBe(false);
    });

    it('should call generateToolsContent on cycle', async () => {
      const genFn = vi.fn().mockReturnValue('Generated content.');
      const writer = createComponentWriter(
        makeDescriptor({ generateToolsContent: genFn }),
      );

      // Create the TOOLS.md file
      const toolsPath = join(workspaceDir, 'TOOLS.md');
      writeFileSync(toolsPath, '');

      await writer.cycle();

      expect(genFn).toHaveBeenCalledOnce();
      const content = readFileSync(toolsPath, 'utf-8');
      expect(content).toContain('Generated content.');
    }, 15_000);

    it('should write component section to TOOLS.md', async () => {
      const writer = createComponentWriter(makeDescriptor());

      const toolsPath = join(workspaceDir, 'TOOLS.md');
      writeFileSync(toolsPath, '');

      await writer.cycle();

      const content = readFileSync(toolsPath, 'utf-8');
      const parsed = parseManaged(content);
      expect(parsed.found).toBe(true);
      expect(parsed.sections.some((s) => s.id === 'Watcher')).toBe(true);
      expect(parsed.sections.find((s) => s.id === 'Watcher')?.content).toBe(
        'Watcher content.',
      );
    }, 15_000);

    it('should skip silently when workspace lock is held', async () => {
      const writer = createComponentWriter(makeDescriptor());
      const toolsPath = join(workspaceDir, 'TOOLS.md');
      writeFileSync(toolsPath, '');
      let releaseOuter: (() => void) | undefined;

      const outer = withWorkspaceLock(workspaceDir, async () => {
        await new Promise<void>((resolve) => {
          releaseOuter = resolve;
        });
      });

      await vi.waitFor(() => {
        expect(releaseOuter).toBeTypeOf('function');
      });
      await expect(writer.cycle()).resolves.toBeUndefined();

      const content = readFileSync(toolsPath, 'utf-8');
      expect(content).toBe('');

      releaseOuter?.();
      await outer;
    }, 15_000);

    it('should emit a cleanup session request when cleanup is detected', async () => {
      const writer = createComponentWriter(makeDescriptor(), {
        gatewayUrl: 'http://127.0.0.1:3456',
      });
      const soulPath = join(workspaceDir, 'SOUL.md');
      writeFileSync(soulPath, await readBundledContent('soul-section.md'));

      await writer.cycle();

      expect(requestCleanupSession).toHaveBeenCalledTimes(1);
      expect(requestCleanupSession).toHaveBeenCalledWith({
        gatewayUrl: 'http://127.0.0.1:3456',
        filePath: soulPath,
        markerIdentity: 'SOUL',
      });
      expect(readFileSync(soulPath, 'utf-8')).toContain('CLEANUP NEEDED');
    }, 15_000);

    it('should fall back to the file warning when the gateway is unavailable', async () => {
      vi.mocked(requestCleanupSession).mockResolvedValueOnce(false);

      const writer = createComponentWriter(makeDescriptor(), {
        gatewayUrl: 'http://127.0.0.1:3456',
      });
      const soulPath = join(workspaceDir, 'SOUL.md');
      writeFileSync(soulPath, await readBundledContent('soul-section.md'));

      await expect(writer.cycle()).resolves.toBeUndefined();

      expect(requestCleanupSession).toHaveBeenCalledTimes(1);
      expect(readFileSync(soulPath, 'utf-8')).toContain('CLEANUP NEEDED');
    }, 15_000);
  });
});
