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

/**
 * Component descriptor — the contract that Jeeves component plugins
 * must implement to participate in the platform.
 */
export interface JeevesComponent {
  /** Component name (e.g., 'watcher', 'runner', 'server', 'meta'). */
  name: string;
  /** Component's own version. */
  version: string;
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
}
