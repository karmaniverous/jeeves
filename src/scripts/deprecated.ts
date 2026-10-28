/**
 * Deprecated script helpers (#127), removed in 4.0.0.
 *
 * @remarks
 * Thin aliases of internal functions, kept in their own module so the entry
 * points re-export them with `export *` (a named re-export of a deprecated
 * symbol fails `no-deprecated`) without exposing the internals.
 *
 * @module
 */

import { getArgImpl, parseArgsImpl } from './fs-utils.js';
import {
  getChannelWorkspaceImpl,
  type SlackWorkspaceOptions,
} from './slack-workspace.js';

/**
 * Parse --key=value arguments from argv into a record.
 *
 * @deprecated Use `parseRunnableArgs`. Removed in 4.0.0.
 * @param argv - Arguments (default: `process.argv.slice(2)`).
 * @returns Values keyed by option name.
 */
export function parseArgs(
  argv: string[] = process.argv.slice(2),
): Record<string, string> {
  return parseArgsImpl(argv);
}

/**
 * Get the value following a named flag, or a default.
 *
 * @deprecated Use `parseRunnableArgs`. Removed in 4.0.0.
 * @param argv - Arguments.
 * @param name - Flag, e.g. `--count`.
 * @param defaultValue - Value when the flag or its value is absent.
 * @returns The value.
 */
export function getArg(
  argv: string[],
  name: string,
  defaultValue: string,
): string {
  return getArgImpl(argv, name, defaultValue);
}

/**
 * Resolve the workspace team ID that owns a Slack channel.
 * Results are cached to disk.
 *
 * @deprecated No remaining consumer. Removed in 4.0.0.
 * @param channelId - Slack channel ID.
 * @param token - Slack bot token for API calls.
 * @param options - Cache path and default workspace.
 * @returns The team ID.
 */
export async function getChannelWorkspace(
  channelId: string,
  token: string,
  options: SlackWorkspaceOptions,
): Promise<string> {
  return getChannelWorkspaceImpl(channelId, token, options);
}
