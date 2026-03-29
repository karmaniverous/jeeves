/**
 * Component interface types for the Jeeves platform.
 *
 * @remarks
 * These types support the platform's HEARTBEAT orchestration and
 * dependency graph resolution.
 */

/** Component dependency declarations. */
export interface ComponentDependencies {
  /**
   * Hard dependencies — the component cannot function without these.
   * If a hard dep is not healthy, suppress all alerts for this component
   * except a "waiting for dependency" message. If a hard dep is declined,
   * auto-decline this component.
   */
  hard: string[];
  /**
   * Soft dependencies — the component works without these but with reduced
   * functionality. When the component is healthy and a soft dep is missing,
   * generate an informational alert. No alert when a soft dep is declined.
   */
  soft: string[];
}
