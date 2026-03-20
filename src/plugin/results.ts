/**
 * Tool result formatters for the OpenClaw plugin SDK.
 *
 * @remarks
 * Provides standardised helpers for building `ToolResult` objects:
 * success, error, and connection-error variants.
 */

import type { ToolResult } from './types.js';

/**
 * Format a successful tool result.
 *
 * @param data - Arbitrary data to return as JSON.
 * @returns A `ToolResult` with JSON-stringified content.
 */
export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Format an error tool result.
 *
 * @param error - Error instance, string, or other value.
 * @returns A `ToolResult` with `isError: true`.
 */
export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: 'Error: ' + message }],
    isError: true,
  };
}

/**
 * Format a connection error with actionable guidance.
 *
 * @remarks
 * Detects `ECONNREFUSED`, `ENOTFOUND`, and `ETIMEDOUT` from
 * `error.cause.code` and returns a user-friendly message referencing
 * the plugin's `config.apiUrl` setting. Falls back to `fail()` for
 * non-connection errors.
 *
 * @param error - Error instance (typically from `fetch`).
 * @param baseUrl - The URL that was being contacted.
 * @param pluginId - The plugin identifier for config guidance.
 * @returns A `ToolResult` with `isError: true`.
 */
export function connectionFail(
  error: unknown,
  baseUrl: string,
  pluginId: string,
): ToolResult {
  const cause = error instanceof Error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : '';

  const isConnectionError =
    code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT';

  if (isConnectionError) {
    return {
      content: [
        {
          type: 'text',
          text: [
            `Service not reachable at ${baseUrl}.`,
            'Either start the service, or if it runs on a different port,',
            `set plugins.entries.${pluginId}.config.apiUrl in openclaw.json.`,
          ].join('\n'),
        },
      ],
      isError: true,
    };
  }

  return fail(error);
}
