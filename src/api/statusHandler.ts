/**
 * Factory for a framework-agnostic `/status` HTTP handler.
 *
 * @remarks
 * Returns a standard status response shape consumed by HEARTBEAT
 * orchestration and the `{name}_status` plugin tool.
 * Tracks process start time internally for uptime calculation.
 */

import { getErrorMessage } from '../utils.js';

/** Options for creating a status handler. */
export interface CreateStatusHandlerOptions {
  /** Component name (e.g., 'watcher'). */
  name: string;
  /** Component version. */
  version: string;
  /** Optional callback returning component-specific health details. */
  getHealth?: () => Promise<Record<string, unknown>>;
}

/** Standard status response body. */
export interface StatusResponse {
  /** Component name. */
  name: string;
  /** Component version. */
  version: string;
  /** Seconds since process start. */
  uptime: number;
  /** Overall status. */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Component-specific health details. */
  health: Record<string, unknown>;
}

/** Return type from a status handler invocation. */
export interface StatusHandlerResult {
  /** HTTP status code. */
  status: number;
  /** Response body. */
  body: StatusResponse;
}

/** Status handler function signature. */
export type StatusHandler = () => Promise<StatusHandlerResult>;

/**
 * Create a framework-agnostic status handler.
 *
 * @param options - Handler configuration.
 * @returns An async function returning `{ status, body }`.
 */
export function createStatusHandler(
  options: CreateStatusHandlerOptions,
): StatusHandler {
  const startTime = Date.now();

  return async (): Promise<StatusHandlerResult> => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    let health: Record<string, unknown> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (options.getHealth) {
      try {
        health = await options.getHealth();
      } catch (err: unknown) {
        health = { error: getErrorMessage(err) };
        overallStatus = 'degraded';
      }
    }

    return {
      status: 200,
      body: {
        name: options.name,
        version: options.version,
        uptime: uptimeSeconds,
        status: overallStatus,
        health,
      },
    };
  };
}
