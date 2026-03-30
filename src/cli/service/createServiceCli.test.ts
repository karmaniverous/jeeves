import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { init, resetInit } from '../../init';
import { makeTestDescriptor } from '../../test/makeTestDescriptor';
import { createServiceCli } from './createServiceCli';

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
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('should create a CLI program with standard commands', () => {
    const program = createServiceCli(makeTestDescriptor());
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
    const program = createServiceCli(makeTestDescriptor());
    const configCmd = program.commands.find((c) => c.name() === 'config');
    expect(configCmd).toBeDefined();

    const subCmds = configCmd!.commands.map((c) => c.name());
    expect(subCmds).not.toContain('query');
    expect(subCmds).toContain('validate');
    expect(subCmds).toContain('apply');
  });

  it('config command should accept jsonpath argument directly', () => {
    const program = createServiceCli(makeTestDescriptor());
    const configCmd = program.commands.find((c) => c.name() === 'config');
    expect(configCmd).toBeDefined();
    const args = configCmd!.registeredArguments;
    expect(args.length).toBeGreaterThan(0);
    expect(args[0].name()).toBe('jsonpath');
  });

  it('should have service subcommands', () => {
    const program = createServiceCli(makeTestDescriptor());
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
    const descriptor = makeTestDescriptor({
      customCliCommands: (program: Command) => {
        program.command('custom-cmd').description('A custom command');
      },
    });
    const program = createServiceCli(descriptor);
    const cmdNames = program.commands.map((c) => c.name());
    expect(cmdNames).toContain('custom-cmd');
  });

  it('should use custom service name', () => {
    const program = createServiceCli(
      makeTestDescriptor({ serviceName: 'my-svc' }),
    );
    // service status subcommand defaults to the descriptor's service name
    const serviceCmd = program.commands.find((c) => c.name() === 'service');
    expect(serviceCmd).toBeDefined();
  });

  // --- Integration tests: command execution ---

  describe('init command execution', () => {
    it('should write config file to output directory', async () => {
      const descriptor = makeTestDescriptor();
      const program = createServiceCli(descriptor);
      const outputDir = join(testDir, 'init-output');

      vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await program.parseAsync(['node', 'test', 'init', '-o', outputDir]);

      const configPath = join(outputDir, descriptor.configFileName);
      expect(existsSync(configPath)).toBe(true);

      const written = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
      expect(written).toEqual(descriptor.initTemplate());
    });

    it('should skip existing config file', async () => {
      const descriptor = makeTestDescriptor();
      const program = createServiceCli(descriptor);
      const outputDir = join(testDir, 'init-existing');
      mkdirSync(outputDir, { recursive: true });

      const configPath = join(outputDir, descriptor.configFileName);
      const existingContent = '{"existing": true}\n';
      writeFileSync(configPath, existingContent);

      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);

      await program.parseAsync(['node', 'test', 'init', '-o', outputDir]);

      expect(readFileSync(configPath, 'utf-8')).toBe(existingContent);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
      );
    });
  });

  describe('config validate command execution', () => {
    const strictSchema = z.object({
      port: z.number().int().positive(),
      watchPaths: z.array(z.string()).default([]),
    });

    it('should accept a valid config file', async () => {
      const descriptor = makeTestDescriptor({ configSchema: strictSchema });
      const program = createServiceCli(descriptor);

      const validConfigPath = join(testDir, 'valid-config.json');
      writeFileSync(validConfigPath, JSON.stringify({ port: 1936 }));

      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);

      await program.parseAsync([
        'node',
        'test',
        'config',
        'validate',
        '-c',
        validConfigPath,
      ]);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('valid'));
      expect(process.exitCode).toBeUndefined();
    });

    it('should reject an invalid config file', async () => {
      const descriptor = makeTestDescriptor({ configSchema: strictSchema });
      const program = createServiceCli(descriptor);

      const invalidConfigPath = join(testDir, 'invalid-config.json');
      writeFileSync(invalidConfigPath, JSON.stringify({ port: -1 }));

      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await program.parseAsync([
        'node',
        'test',
        'config',
        'validate',
        '-c',
        invalidConfigPath,
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation failed'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('status command execution', () => {
    it('should return error for unreachable service', async () => {
      const program = createServiceCli(makeTestDescriptor());

      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      await program.parseAsync(['node', 'test', 'status', '-p', '19999']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Service unreachable'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('service status command execution', () => {
    it('should return not_installed for nonexistent service', async () => {
      const program = createServiceCli(makeTestDescriptor());

      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined);

      await program.parseAsync([
        'node',
        'test',
        'service',
        'status',
        '-n',
        'nonexistent-jeeves-test-12345',
      ]);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('not_installed'),
      );
    });
  });
});
