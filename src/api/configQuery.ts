/**
 * Generic config query handler with JSONPath support.
 *
 * @remarks
 * Provides a transport-agnostic config query function that can be
 * used by any Jeeves component's HTTP API. Returns the full config
 * document or filters it via JSONPath expressions.
 *
 * @module
 */

import { JSONPath } from 'jsonpath-plus';

import { errorBody } from './errorBody.js';

/** Code of the 400 sent for an invalid JSONPath. */
export const JEEVES_CONFIG_QUERY_INVALID = 'JEEVES_CONFIG_QUERY_INVALID';

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
 * The 400 is Fastify's error body ({@link errorBody}) with code
 * {@link JEEVES_CONFIG_QUERY_INVALID}.
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
      const matches = JSONPath({
        path: query.path,
        json: config as object,
        wrap: true,
      });
      const result: unknown[] = Array.isArray(matches) ? matches : [];
      return Promise.resolve({
        status: 200,
        body: { result, count: result.length },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Query failed';
      return Promise.resolve({
        status: 400,
        body: errorBody(400, message, JEEVES_CONFIG_QUERY_INVALID),
      });
    }
  };
}
