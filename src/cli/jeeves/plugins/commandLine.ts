/**
 * Pure display formatting of command lines for logs, dry-run output and
 * error messages. No I/O.
 *
 * @remarks
 * Commands are always spawned with an argument vector (see
 * `commandRunner.ts`); these strings are only ever shown, never executed.
 *
 * @module
 */

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

/**
 * One-line summary of a non-zero exit, for warnings.
 *
 * @param command - Executable name.
 * @param args - Argument vector.
 * @param exitCode - Exit code.
 * @returns `<command line> exited <code>`.
 */
export function describeExit(
  command: string,
  args: readonly string[],
  exitCode: number,
): string {
  return `${formatCommand(command, args)} exited ${String(exitCode)}`;
}
