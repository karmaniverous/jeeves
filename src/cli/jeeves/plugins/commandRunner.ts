/**
 * Child-process port for the jeeves CLI: run `openclaw`/`npm` and fail loudly.
 *
 * @remarks
 * {@link spawnCommandRunner} is the only adapter that touches a process. It
 * uses `cross-spawn` so the same argument vector works on Windows (where
 * `openclaw`/`npm` are `.cmd` shims that need cmd.exe quoting) and on
 * Linux/macOS, without ever building a shell string. {@link runChecked}
 * throws {@link CommandFailedError} on any non-zero exit.
 *
 * @module
 */

import spawn from 'cross-spawn';

import { redactSecrets } from './secrets.js';

/** Captured result of a finished command. */
export interface CommandResult {
  /** Process exit code (1 when the process was killed by a signal). */
  exitCode: number;
  /** Captured stdout. */
  stdout: string;
  /** Captured stderr. */
  stderr: string;
}

/** Options for a single command run. */
export interface CommandRunOptions {
  /** Also stream the child's output to this process's stdout/stderr. */
  echo?: boolean;
  /**
   * Secret values in the arguments. They are redacted from echoed output and
   * error messages; echo is buffered until exit so no secret is split.
   */
  redact?: readonly string[];
}

/** Port: run a command with an argument vector (never a shell string). */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandRunOptions,
) => Promise<CommandResult>;

const SAFE_ARG = /^[\w@%+=:,./-]+$/;

/**
 * Quote one argument for display, POSIX-style.
 *
 * @param arg - Raw argument.
 * @returns The argument, single-quoted when it contains unsafe characters.
 */
export function quoteArg(arg: string): string {
  if (arg === '') return "''";
  return SAFE_ARG.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Format a command line for logs and dry-run output.
 *
 * @param command - Executable name.
 * @param args - Argument vector.
 * @returns A copy-pasteable (POSIX shell) command line.
 */
export function formatCommand(
  command: string,
  args: readonly string[],
): string {
  return [command, ...args].map(quoteArg).join(' ');
}

/** Thrown when a command exits non-zero. */
export class CommandFailedError extends Error {
  /** The formatted command line. */
  readonly commandLine: string;
  /** The captured result. */
  readonly result: CommandResult;

  /**
   * @param commandLine - The formatted command line.
   * @param result - The captured result.
   */
  constructor(commandLine: string, result: CommandResult) {
    const detail = (result.stderr.trim() || result.stdout.trim())
      .split(/\r?\n/)
      .slice(-10)
      .join('\n');
    super(
      `Command failed (exit ${String(result.exitCode)}): ${commandLine}${detail ? `\n${detail}` : ''}`,
    );
    this.name = 'CommandFailedError';
    this.commandLine = commandLine;
    this.result = result;
  }
}

/**
 * Run a command and throw {@link CommandFailedError} unless it exits 0.
 *
 * @param runner - Command runner port.
 * @param command - Executable name.
 * @param args - Argument vector.
 * @param options - Run options.
 * @returns The captured result.
 */
export async function runChecked(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  options?: CommandRunOptions,
): Promise<CommandResult> {
  const result = await runner(command, args, options);
  if (result.exitCode !== 0) {
    const redact = (text: string) => redactSecrets(text, options?.redact);
    throw new CommandFailedError(redact(formatCommand(command, args)), {
      exitCode: result.exitCode,
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
    });
  }
  return result;
}

/** Default adapter: spawn via `cross-spawn`, capture output, never use a shell. */
export const spawnCommandRunner: CommandRunner = (command, args, options) =>
  new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const secrets = options?.redact ?? [];
    const stream = options?.echo === true && secrets.length === 0;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      if (stream) process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      if (stream) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (options?.echo === true && !stream) {
        process.stdout.write(redactSecrets(stdout, secrets));
        process.stderr.write(redactSecrets(stderr, secrets));
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
