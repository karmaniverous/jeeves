/**
 * Core types for the OpenClaw plugin SDK.
 *
 * @remarks
 * These types define the contract between plugins and the OpenClaw gateway.
 * They unify the various `PluginApi` definitions previously duplicated
 * across component plugins into a single canonical source.
 */

/** Result shape returned by tool executions. */
export interface ToolResult {
  /** Content blocks — typically a single text block. */
  content: Array<{ type: string; text: string }>;
  /** Whether this result represents an error. */
  isError?: boolean;
}

/** Tool descriptor for registration with the OpenClaw gateway. */
export interface ToolDescriptor {
  /** Unique tool name. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: Record<string, unknown>;
  /** Execute the tool with the given parameters. */
  execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

/** Options for tool registration. */
export interface ToolRegistrationOptions {
  /** Whether the tool is optional (non-fatal if registration fails). */
  optional?: boolean;
}

/**
 * Canonical OpenClaw plugin API interface.
 *
 * @remarks
 * This is the shape of the `api` object passed to plugins by the
 * OpenClaw gateway at registration time. Fields are optional where
 * the gateway may not provide them in all versions.
 */
export interface PluginApi {
  /** OpenClaw configuration object. */
  config?: {
    /** Agent configuration block. */
    agents?: {
      /** Default agent settings. */
      defaults?: {
        /** Absolute path to the workspace root directory. */
        workspace?: string;
      };
    };
    /** Installed plugin configuration. */
    plugins?: {
      /** Plugin entries keyed by plugin ID. */
      entries?: Record<string, { config?: Record<string, unknown> }>;
    };
  };

  /**
   * Resolve a path relative to the OpenClaw workspace.
   *
   * @remarks
   * Present on newer OpenClaw builds; optional for backwards compatibility.
   */
  resolvePath?: (input: string) => string;

  /**
   * Register a tool with the OpenClaw gateway.
   *
   * @param tool - Tool descriptor.
   * @param options - Registration options.
   */
  registerTool(tool: ToolDescriptor, options?: ToolRegistrationOptions): void;
}
