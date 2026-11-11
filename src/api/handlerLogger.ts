/**
 * The logger core's framework-agnostic handlers write to what their
 * responses leave out (spec 5d.2, 5d.3).
 *
 * @module
 */

/**
 * Where a core handler (config apply, status) logs what its response leaves
 * out: the underlying error, and the file path where there is one.
 * Pino-compatible, so a Fastify `request.log` or an app logger fits.
 */
export interface HandlerLogger {
  /**
   * Logs a failure.
   *
   * @param details - The underlying `err`, and the config file `path` where
   *   there is one.
   * @param message - What failed.
   */
  error: (details: object, message: string) => void;
}

/** Default {@link HandlerLogger} for direct callers: `console.error`. */
export const consoleHandlerLogger: HandlerLogger = {
  error: (details, message) => {
    console.error(message, details);
  },
};
