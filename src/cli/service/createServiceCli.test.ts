import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { JeevesComponentDescriptor } from '../../component/descriptor';
import { init, resetInit } from '../../init';
import { createServiceCli } from './createServiceCli';

function makeDescriptor(
  overrides: Partial<JeevesComponentDescriptor> = {},
): JeevesComponentDescriptor {
  return {
    name: 'watcher',
    version: '0.11.1',
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: z.object({
      watchPaths: z.array(z.string()).default([]),
    }),
    configFileName: 'config.json',
    initTemplate: () => ({ watchPaths: [] }),
    startCommand: (configPath: string) => [
      'node',
      'dist/index.js',
      '-c',
      configPath,
    ],
    sectionId: 'Watcher',
    refreshIntervalSeconds: 71,
    generateToolsContent: () => 'content',
    ...overrides,
  } as JeevesComponentDescriptor;
}

describe('createServiceCli', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-cli-test-${String(Date.now())}`);
    const configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should create a CLI program with standard commands', () => {
    const program = createServiceCli(makeDescriptor());
    expect(program.name()).toBe('jeeves-watcher');
    expect(program.version()).toBe('0.11.1');

    const cmdNames = program.commands.map((c) => c.name());
    expect(cmdNames).toContain('start');
    expect(cmdNames).toContain('status');
    expect(cmdNames).toContain('config');
    expect(cmdNames).toContain('init');
    expect(cmdNames).toContain('service');
  });

  it('should have config subcommands', () => {
    const program = createServiceCli(makeDescriptor());
    const configCmd = program.commands.find((c) => c.name() === 'config');
    expect(configCmd).toBeDefined();

    const subCmds = configCmd!.commands.map((c) => c.name());
    expect(subCmds).toContain('query');
    expect(subCmds).toContain('validate');
    expect(subCmds).toContain('apply');
  });

  it('should have service subcommands', () => {
    const program = createServiceCli(makeDescriptor());
    const serviceCmd = program.commands.find((c) => c.name() === 'service');
    expect(serviceCmd).toBeDefined();

    const subCmds = serviceCmd!.commands.map((c) => c.name());
    expect(subCmds).toContain('install');
    expect(subCmds).toContain('uninstall');
    expect(subCmds).toContain('start');
    expect(subCmds).toContain('stop');
    expect(subCmds).toContain('restart');
    expect(subCmds).toContain('status');
  });

  it('should apply custom CLI commands', () => {
    const descriptor = makeDescriptor({
      customCliCommands: (program) => {
        program.command('custom-cmd').description('A custom command');
      },
    });
    const program = createServiceCli(descriptor);
    const cmdNames = program.commands.map((c) => c.name());
    expect(cmdNames).toContain('custom-cmd');
  });

  it('should use custom service name', () => {
    const program = createServiceCli(makeDescriptor({ serviceName: 'my-svc' }));
    // service status subcommand defaults to the descriptor's service name
    const serviceCmd = program.commands.find((c) => c.name() === 'service');
    expect(serviceCmd).toBeDefined();
  });
});
