/**
 * Default port assignments for Jeeves platform services.
 *
 * @remarks
 * Each port number is a historical reference:
 * - 1934: Wodehouse's *Thank You, Jeeves*; Popper's *Logic of Scientific Discovery*
 * - 1936: Turing's "On Computable Numbers"; Church's lambda calculus
 * - 1937: Turing's paper in *Proceedings of the London Mathematical Society*
 * - 1938: Wodehouse's *The Code of the Woosters*; Shannon's relay/switching paper
 */

/** Default port for jeeves-server. */
export const SERVER_PORT = 1934;

/** Default port for jeeves-watcher. */
export const WATCHER_PORT = 1936;

/** Default port for jeeves-runner. */
export const RUNNER_PORT = 1937;

/** Default port for jeeves-meta. */
export const META_PORT = 1938;

/** Map of service names to their default ports. */
export const DEFAULT_PORTS: Record<string, number> = {
  server: SERVER_PORT,
  watcher: WATCHER_PORT,
  runner: RUNNER_PORT,
  meta: META_PORT,
} as const;
