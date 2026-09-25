/**
 * Structural subset of the OpenClaw plugin API used by Jeeves plugins.
 *
 * @remarks
 * Mirrors the shapes in OpenClaw's plugin SDK (v2026.9.6:
 * `src/plugins/plugin-api.types.ts`, `hook-types.ts`,
 * `hook-before-agent-start.types.ts`, `plugin-instance.types.ts`) without
 * depending on OpenClaw. Only the members Jeeves uses are declared; optional
 * members degrade gracefully on older hosts.
 */

import type {
  HookRegistrationOptions,
  PluginLifecycleApi,
  PromptBuildHandler,
} from './hookTypes.js';

/** Result shape returned by tool executions. */
export interface ToolResult {
  /** Content blocks — typically a single text block. */
  content: Array<{
    /** MIME type identifier (e.g. `"text"`). */
    type: string;
    /** Text content of the block. */
    text: string;
  }>;
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
      entries?: Record<
        string,
        {
          /** Plugin-specific configuration key-value pairs. */
          config?: Record<string, unknown>;
        }
      >;
    };
  };

  /**
   * Resolve a path relative to the OpenClaw workspace.
   *
   * @remarks
   * Present on newer OpenClaw builds; optional for backwards compatibility.
   */
  resolvePath?: (input: string) => string;

  /** Plugin-scoped config (`plugins.entries.<id>.config`), when provided. */
  pluginConfig?: Record<string, unknown>;

  /** Host logger, when provided. */
  logger?: {
    /** Log a warning. */
    warn: (message: string) => void;
  };

  /**
   * Plugin-owned lifecycle: disposal signal and cleanup registration.
   * Present on OpenClaw 2026.9.x.
   */
  lifecycle?: PluginLifecycleApi;

  /**
   * Register a typed hook handler. Jeeves only uses `before_prompt_build`
   * (see {@link registerPromptContext}).
   *
   * @param hookName - Hook name.
   * @param handler - Hook handler.
   * @param opts - Registration options.
   */
  on?(
    hookName: 'before_prompt_build',
    handler: PromptBuildHandler,
    opts?: HookRegistrationOptions,
  ): void;

  /**
   * Register a tool with the OpenClaw gateway.
   *
   * @param tool - Tool descriptor.
   * @param options - Registration options.
   */
  registerTool(tool: ToolDescriptor, options?: ToolRegistrationOptions): void;
}
