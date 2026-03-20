/**
 * Generic config query handler with JSONPath support.
 *
 * @remarks
 * Provides a transport-agnostic config query function that can be
 * used by any Jeeves component's HTTP API. Returns the full config
 * document or filters it via JSONPath expressions.
 */

import { JSONPath } from 'jsonpath-plus';

/** Response shape for config query results. */
export interface ConfigQueryResponse {
  /** HTTP status code. */
  status: number;
  /** Response body. */
  body: unknown;
}

/**
 * Handler function type for config queries.
 *
 * @param query - Query parameters.
 * @returns Response with status code and body.
 */
export type ConfigQueryHandler = (query: {
  path?: string;
}) => Promise<ConfigQueryResponse>;

/**
 * Create a config query handler.
 *
 * @remarks
 * - No `path` parameter → returns the full config document.
 * - Valid JSONPath → returns matching results with count.
 * - Invalid JSONPath → returns 400 error.
 *
 * @param getConfig - Function that returns the current config object.
 * @returns A config query handler function.
 */
export function createConfigQueryHandler(
  getConfig: () => unknown,
): ConfigQueryHandler {
  return (query: { path?: string }): Promise<ConfigQueryResponse> => {
    const config = getConfig();

    if (!query.path) {
      return Promise.resolve({ status: 200, body: config });
    }

    try {
      const result: unknown[] = JSONPath({
        path: query.path,
        json: config as object,
      });
      return Promise.resolve({
        status: 200,
        body: { result, count: result.length },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Query failed';
      return Promise.resolve({ status: 400, body: { error: message } });
    }
  };
}
