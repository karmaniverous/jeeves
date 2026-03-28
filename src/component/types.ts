/**
 * Component interface types for the Jeeves platform.
 *
 * @remarks
 * These types define the contract that component plugins must implement
 * to participate in the platform. The `JeevesComponent` interface is
 * the primary integration point.
 */

/** Service health status. */
export interface ServiceStatus {
  /** Whether the service is running. */
  running: boolean;
  /** Optional version string. */
  version?: string;
  /** Optional uptime in seconds. */
  uptimeSeconds?: number;
}

/** Service lifecycle commands. */
export interface ServiceCommands {
  /** Stop the service. */
  stop(): Promise<void>;
  /** Uninstall the service. */
  uninstall(): Promise<void>;
  /** Query service status. */
  status(): Promise<ServiceStatus>;
}

/** Plugin lifecycle commands. */
export interface PluginCommands {
  /** Uninstall the plugin. */
  uninstall(): Promise<void>;
}

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

/**
 * Component descriptor — the contract that Jeeves component plugins
 * must implement to participate in the platform.
 */
export interface JeevesComponent {
  /** Component name (e.g., 'watcher', 'runner', 'server', 'meta'). */
  name: string;
  /** Component's own version (plugin package version). */
  version: string;
  /** npm package name for the service (e.g., `\@karmaniverous/jeeves-watcher`). */
  servicePackage?: string;
  /** npm package name for the plugin (e.g., `\@karmaniverous/jeeves-watcher-openclaw`). */
  pluginPackage?: string;
  /** TOOLS.md section name (e.g., 'Watcher'). */
  sectionId: string;
  /** Refresh interval in seconds (must be a prime number). */
  refreshIntervalSeconds: number;
  /** Produce the component's TOOLS.md section content. */
  generateToolsContent(): string;
  /** Service lifecycle commands. */
  serviceCommands: ServiceCommands;
  /** Plugin lifecycle commands. */
  pluginCommands: PluginCommands;
  /**
   * Component dependencies. Optional — components with no dependencies
   * omit this field (runner, watcher). Components with dependencies
   * declare them here (meta: hard=['watcher'], server: soft=['watcher','runner','meta']).
   */
  dependencies?: ComponentDependencies;
}
