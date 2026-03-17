import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { init, resetInit } from '../init';
import { parseManaged } from '../managed/parseManaged';
import { createComponentWriter } from './createComponentWriter';
import type { JeevesComponent } from './types';

function makeComponent(
  overrides: Partial<JeevesComponent> = {},
): JeevesComponent {
  return {
    name: 'watcher',
    version: '0.10.1',
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'Watcher content.',
    serviceCommands: {
      stop: vi.fn().mockResolvedValue(undefined),
      uninstall: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ running: true, version: '0.10.1' }),
    },
    pluginCommands: {
      uninstall: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
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
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should reject non-prime interval', () => {
    expect(() =>
      createComponentWriter(makeComponent({ refreshIntervalSeconds: 60 })),
    ).toThrow('prime number');
  });

  it('should reject interval of 1', () => {
    expect(() =>
      createComponentWriter(makeComponent({ refreshIntervalSeconds: 1 })),
    ).toThrow('prime number');
  });

  it('should accept prime interval', () => {
    expect(() =>
      createComponentWriter(makeComponent({ refreshIntervalSeconds: 67 })),
    ).not.toThrow();
  });

  it('should reject empty name', () => {
    expect(() => createComponentWriter(makeComponent({ name: '' }))).toThrow(
      'non-empty string',
    );
  });

  it('should reject empty version', () => {
    expect(() => createComponentWriter(makeComponent({ version: '' }))).toThrow(
      'non-empty string',
    );
  });

  it('should reject empty sectionId', () => {
    expect(() =>
      createComponentWriter(makeComponent({ sectionId: '' })),
    ).toThrow('non-empty string');
  });

  it('should return a ComponentWriter instance', () => {
    const writer = createComponentWriter(makeComponent());
    expect(writer).toBeDefined();
    expect(writer.componentConfigDir).toMatch(/jeeves-watcher$/);
  });

  describe('ComponentWriter lifecycle', () => {
    it('should start and stop', () => {
      const writer = createComponentWriter(makeComponent());
      expect(writer.isRunning).toBe(false);
      writer.start();
      expect(writer.isRunning).toBe(true);
      writer.stop();
      expect(writer.isRunning).toBe(false);
    });

    it('should not start twice', () => {
      const writer = createComponentWriter(makeComponent());
      writer.start();
      writer.start(); // Should be a no-op
      expect(writer.isRunning).toBe(true);
      writer.stop();
    });

    it('should call generateToolsContent on cycle', async () => {
      const genFn = vi.fn().mockReturnValue('Generated content.');
      const writer = createComponentWriter(
        makeComponent({ generateToolsContent: genFn }),
        { probeTimeoutMs: 100 },
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
      const writer = createComponentWriter(makeComponent(), {
        probeTimeoutMs: 100,
      });

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
  });
});
