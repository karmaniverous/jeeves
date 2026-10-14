/**
 * Shared harness for the `jeeves install` / `jeeves update` command tests:
 * temp workspace, console capture, `process.exitCode` guard, a fresh
 * Commander program per run, and the `jeeves-server` config fixtures.
 * `vi.mock` calls stay in each test file (hoisting is per file); this
 * module holds only plain fixtures and hook registration. Test-only.
 *
 * @module
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach } from 'vitest';

import { useConsoleCapture, useUnsetEnv } from '../../test/cliHarness.js';
import { useTempDir } from '../../test/tempDir.js';
import { RESTART_NOTICE } from './cliOutput.js';
import type { CommandResult } from './plugins/commandRunner.js';
import { fakeTempFiles, ok } from './plugins/fakePorts.js';
import {
  type CommandTestPorts,
  npmRecord,
  S,
  SPKG,
} from './plugins/workflowTestKit.js';
import type { PostPluginResult } from './postPluginSteps.js';

/** The mocked `runPostPluginSteps` result when a test does not override it. */
export const DEFAULT_POST_PLUGIN_RESULT: PostPluginResult = {
  failed: false,
  distChanged: false,
};

/** Per-test paths: a temp dir and a workspace inside it. */
export interface CommandTestPaths {
  dir: string;
  ws: string;
}

/** Options for {@link useCommandTest}. */
export interface CommandTestOptions {
  /** Temp dir prefix. */
  prefix: string;
  /** e.g. `registerInstallCommand`. */
  register: (program: Command) => void;
  /** e.g. `'install'`. */
  command: string;
  /** Args placed before each test's own (e.g. target and `-w`). */
  baseArgs: (paths: CommandTestPaths) => readonly string[];
}

/**
 * Register the per-test hooks and return the helpers a command test needs.
 *
 * @param state - The file's hoisted ports (read by its `pluginDeps` mock).
 * @param options - Command and argument wiring.
 * @returns Paths (refreshed per test), captured output and runners.
 */
export function useCommandTest(
  state: CommandTestPorts,
  options: CommandTestOptions,
) {
  const tempDir = useTempDir(options.prefix);
  const out = useConsoleCapture();
  useUnsetEnv('JEEVES_CONFIG_ROOT');
  const paths: CommandTestPaths = { dir: '', ws: '' };
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    paths.dir = tempDir();
    paths.ws = join(paths.dir, 'ws');
    mkdirSync(paths.ws, { recursive: true });
    state.temp = fakeTempFiles();
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  /** Run the command with the base args plus `args`. */
  const run = async (...args: string[]): Promise<void> => {
    const program = new Command().exitOverride();
    options.register(program);
    await program.parseAsync(
      [options.command, ...options.baseArgs(paths), ...args],
      { from: 'user' },
    );
  };

  return {
    paths,
    out,
    run,
    /** The single `config set --batch-file` batch written, if any. */
    batch: (): unknown => state.temp?.batch(),
    /** OpenClaw calls that change something (installs and config sets). */
    mutations: (): string[] =>
      (state.fake?.lines() ?? []).filter((l) =>
        / plugins install | config set /.test(` ${l} `),
      ),
    /** How many output lines carry the restart notice. */
    restartNotices: (): number =>
      out.filter((l) => l.includes(RESTART_NOTICE)).length,
  };
}

/**
 * Fake OpenClaw for installing the server plugin: OpenClaw 2026.9.6, the
 * given `plugins` config, and `SPKG@0.14.0` on npm.
 *
 * @param entries - `plugins.entries` (default none).
 * @param installed - Whether `SPKG@0.14.0` is already installed.
 * @param hooks - The package's `jeeves.conversationHooks` output.
 * @returns A script for `fakeRunner`.
 */
export const serverPluginScript = (
  entries?: Record<string, unknown>,
  installed = false,
  hooks = '',
): Record<string, CommandResult> => ({
  'openclaw --version': ok('OpenClaw 2026.9.6'),
  'openclaw config get plugins': ok(
    entries ? JSON.stringify({ entries }) : '{}',
  ),
  'openclaw plugins inspect --all --json': ok(
    installed ? JSON.stringify([npmRecord(S, SPKG, '0.14.0')]) : '[]',
  ),
  [`npm view ${SPKG}`]: ok('"0.14.0"'),
  [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(hooks),
});

/**
 * Path of the `jeeves-server` config file under a config root.
 *
 * @param configRoot - Platform config root.
 * @returns The file path.
 */
export const serverConfigPath = (configRoot: string): string =>
  join(configRoot, 'jeeves-server', 'config.json');

/**
 * Write a `jeeves-server` config file (creating its directory).
 *
 * @param configRoot - Platform config root.
 * @param value - Parsed config content.
 */
export function writeServerConfig(configRoot: string, value: unknown): void {
  mkdirSync(join(configRoot, 'jeeves-server'), { recursive: true });
  writeFileSync(
    serverConfigPath(configRoot),
    JSON.stringify(value, null, 2) + '\n',
  );
}
