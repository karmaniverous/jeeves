/**
 * Factory for a framework-agnostic `/status` HTTP handler.
 *
 * @remarks
 * Returns a standard status response shape consumed by `jeeves status` and
 * the `{name}_status` plugin tool.
 * Tracks process start time internally for uptime calculation.
 *
 * @module
 */

import { consoleHandlerLogger, type HandlerLogger } from './handlerLogger.js';

/**
 * `health.error` in the degraded reply when the health check throws. The
 * error itself is logged, never sent (spec 5d.3).
 */
const HEALTH_CHECK_FAILED_MESSAGE = 'The health check failed.';

/** Options for creating a status handler. */
export interface CreateStatusHandlerOptions {
  /** Component name (e.g., 'watcher'). */
  name: string;
  /** Component version. */
  version: string;
  /**
   * Optional callback returning component-specific health details. If it
   * throws, the reply is `degraded`, `health.error` is
   * "The health check failed." and the error is logged.
   */
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

/**
 * Status handler function signature.
 *
 * @param logger - Where a throwing health check's error is logged (e.g. the
 *   Fastify request's `log`); default `console.error`. `standardHandlers`
 *   passes its `logger` option, else `request.log`.
 */
export type StatusHandler = (
  logger?: HandlerLogger,
) => Promise<StatusHandlerResult>;

/**
 * Create a framework-agnostic status handler.
 *
 * @remarks
 * When `getHealth` throws, the reply is still 200, with status `degraded`
 * and `health.error` "The health check failed."; the error is logged
 * to the handler's `logger`, never sent, since status routes are often
 * unauthenticated (spec 5d.3).
 *
 * @param options - Handler configuration.
 * @returns An async function returning `{ status, body }`.
 */
export function createStatusHandler(
  options: CreateStatusHandlerOptions,
): StatusHandler {
  const startTime = Date.now();

  return async (
    logger: HandlerLogger = consoleHandlerLogger,
  ): Promise<StatusHandlerResult> => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    let health: Record<string, unknown> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (options.getHealth) {
      try {
        health = await options.getHealth();
      } catch (err: unknown) {
        logger.error(
          { err },
          `Status: the ${options.name} health check failed`,
        );
        health = { error: HEALTH_CHECK_FAILED_MESSAGE };
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
