import { Command } from '@commander-js/extra-typings';
import { z } from 'zod';

/**
 * Structural types for OpenClaw's `before_prompt_build` hook and plugin
 * lifecycle API (subset, OpenClaw v2026.9.6).
 *
 * @remarks
 * `PromptBuildResult` deliberately omits `systemPrompt`: in OpenClaw it
 * REPLACES the entire system prompt (first value wins). Jeeves plugins must
 * only append, via `appendSystemContext` (runbook D5).
 *
 * @module
 */
/** Event passed to `before_prompt_build` handlers (subset). */
interface PromptBuildEvent {
    /** Current prompt text. */
    prompt: string;
    /** Session messages prepared for this run. */
    messages: unknown[];
}
/** Agent context passed to hook handlers (subset). */
interface PromptBuildContext {
    /** Agent id. */
    agentId?: string;
    /** Session key. */
    sessionKey?: string;
    /** Workspace directory for this run. */
    workspaceDir?: string;
    /** Channel/plugin id for channel-originated runs. */
    channel?: string;
    /** What triggered this turn (e.g. `user`, `heartbeat`, `cron`). */
    trigger?: string;
}
/**
 * Result a Jeeves `before_prompt_build` handler may return.
 *
 * @remarks
 * `appendSystemContext` is appended after the prompt-cache boundary in an
 * "OpenClaw plugin-injected system context" block; text from several plugins
 * is concatenated in priority order and does not count toward
 * `bootstrapMaxChars`.
 */
interface PromptBuildResult {
    /** Text appended to the agent system prompt. */
    appendSystemContext?: string;
}
/** A `before_prompt_build` handler. */
type PromptBuildHandler = (event: PromptBuildEvent, ctx: PromptBuildContext) => Promise<PromptBuildResult | undefined> | PromptBuildResult | undefined;
/** Hook registration options (subset). */
interface HookRegistrationOptions {
    /** Ordering among handlers; higher runs first. */
    priority?: number;
    /** Stable id for this registration. */
    registrationId?: string;
    /** Per-handler timeout in ms (OpenClaw default for this hook: 15 000). */
    timeoutMs?: number;
}
/** Plugin-owned lifecycle API (subset of `api.lifecycle`). */
interface PluginLifecycleApi {
    /** Aborted when the plugin instance is retired. */
    readonly signal?: AbortSignal;
    /**
     * Register a disposer run when the plugin instance is retired.
     *
     * @returns A function that unregisters the disposer.
     */
    onDispose?: (dispose: () => void | Promise<void>) => () => void;
    /** Register named cleanup for plugin-owned background work. */
    registerRuntimeLifecycle?: (registration: {
        /** Registration id. */
        id: string;
        /** Human-readable description. */
        description?: string;
        /** Release resources. */
        dispose?: () => void | Promise<void>;
    }) => void;
}

/**
 * Structural subset of the OpenClaw plugin API used by Jeeves plugins.
 *
 * @remarks
 * Mirrors the shapes in OpenClaw's plugin SDK (v2026.9.6:
 * `src/plugins/plugin-api.types.ts`, `hook-types.ts`,
 * `hook-before-agent-start.types.ts`, `plugin-instance.types.ts`) without
 * depending on OpenClaw. Only the members Jeeves uses are declared; optional
 * members degrade gracefully on older hosts.
 *
 * @module
 */

/** Result shape returned by tool executions. */
interface ToolResult {
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
interface ToolDescriptor {
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
interface ToolRegistrationOptions {
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
interface PluginApi {
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
            entries?: Record<string, {
                /** Plugin-specific configuration key-value pairs. */
                config?: Record<string, unknown>;
            }>;
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
    on?(hookName: 'before_prompt_build', handler: PromptBuildHandler, opts?: HookRegistrationOptions): void;
    /**
     * Register a tool with the OpenClaw gateway.
     *
     * @param tool - Tool descriptor.
     * @param options - Registration options.
     */
    registerTool(tool: ToolDescriptor, options?: ToolRegistrationOptions): void;
}

/**
 * Zod schema for the Jeeves component descriptor.
 *
 * @remarks
 * Zod-first: the TypeScript type is inferred via `z.infer<>`. The descriptor
 * drives the service CLI, service manager, config handlers, and standard
 * plugin toolset. v1 removed the TOOLS.md writer fields (`sectionId`,
 * `refreshIntervalSeconds`, `generateToolsContent`, `dependencies`).
 *
 * @module
 */

/**
 * Zod schema for the Jeeves component descriptor.
 *
 * @remarks
 * Single source of truth for what a component must provide.
 * Factories consume this descriptor to produce CLI commands,
 * plugin tools, and HTTP handlers.
 */
declare const jeevesComponentDescriptorSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodString;
    servicePackage: z.ZodString;
    pluginPackage: z.ZodString;
    serviceName: z.ZodOptional<z.ZodString>;
    defaultPort: z.ZodNumber;
    configSchema: z.ZodCustom<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    configFileName: z.ZodString;
    initTemplate: z.ZodFunction<z.ZodTuple<readonly [], null>, z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    onConfigApply: z.ZodOptional<z.ZodFunction<z.ZodTuple<readonly [z.ZodRecord<z.ZodString, z.ZodUnknown>], null>, z.ZodPromise<z.ZodVoid>>>;
    customMerge: z.ZodOptional<z.ZodFunction<z.ZodTuple<readonly [z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodRecord<z.ZodString, z.ZodUnknown>], null>, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    startCommand: z.ZodFunction<z.ZodTuple<readonly [z.ZodString], null>, z.ZodArray<z.ZodString>>;
    run: z.ZodFunction<z.ZodTuple<readonly [z.ZodString], null>, z.ZodPromise<z.ZodVoid>>;
    customCliCommands: z.ZodOptional<z.ZodFunction<z.ZodTuple<readonly [z.ZodCustom<Command<[], {}, {}>, Command<[], {}, {}>>], null>, z.ZodVoid>>;
    customPluginTools: z.ZodOptional<z.ZodFunction<z.ZodTuple<readonly [z.ZodCustom<PluginApi, PluginApi>], null>, z.ZodArray<z.ZodUnknown>>>;
}, z.core.$strip>;
/** Inferred TypeScript type for the component descriptor. */
type JeevesComponentDescriptor = z.infer<typeof jeevesComponentDescriptorSchema>;
/**
 * Derive the effective service name from a descriptor.
 *
 * @param descriptor - The component descriptor.
 * @returns The service name (explicit or derived from `jeeves-{name}`).
 */
declare function getEffectiveServiceName(descriptor: JeevesComponentDescriptor): string;

/**
 * Factory for a framework-agnostic config apply HTTP handler.
 *
 * @remarks
 * Derives the config file path from the descriptor, deep-merges the patch
 * into the raw file contents (or replaces them), validates the merged object
 * against the descriptor's Zod schema, writes the merged object atomically
 * with the file's existing mode, and calls the optional `onConfigApply`
 * callback.
 *
 * The schema's parsed output is never written: keys the schema doesn't know
 * are kept and defaults are not materialized in the file.
 */

/** Request shape for the config apply handler. */
interface ConfigApplyRequest {
    /** Config patch to apply (deep-merged with existing config). */
    patch: Record<string, unknown>;
    /** When true, replace the entire config instead of merging. */
    replace?: boolean;
}
/** Result shape returned by the config apply handler. */
interface ConfigApplyResult {
    /** HTTP status code. */
    status: number;
    /** Response body. */
    body: unknown;
}
/** Config apply handler function signature. */
type ConfigApplyHandler = (request: ConfigApplyRequest) => Promise<ConfigApplyResult>;
/**
 * Create a framework-agnostic config apply handler.
 *
 * @remarks
 * The handler:
 * 1. Reads the raw config from `{configRoot}/jeeves-{name}/{configFileName}`
 *    (an unreadable file fails with 500 and is left untouched)
 * 2. Deep-merges the patch into it (or replaces it if `replace: true`)
 * 3. Validates the merged object against `descriptor.configSchema`
 * 4. Writes the merged object (not the schema's parsed output) atomically,
 *    keeping the existing file mode (0600 for a new file)
 * 5. Calls `descriptor.onConfigApply` with the validated (parsed) config
 *
 * The response `config` is the validated (parsed) config, as before.
 *
 * @param descriptor - The component descriptor.
 * @param configPath - Optional explicit config file path. When provided, takes
 *   precedence over registered and derived paths.
 * @returns An async handler returning `{ status, body }`.
 */
declare function createConfigApplyHandler(descriptor: JeevesComponentDescriptor, configPath?: string): ConfigApplyHandler;

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
/** Response shape for config query results. */
interface ConfigQueryResponse {
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
type ConfigQueryHandler = (query: {
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
 * @param getConfig - Function that returns the current config object.
 * @returns A config query handler function.
 */
declare function createConfigQueryHandler(getConfig: () => unknown): ConfigQueryHandler;

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
/** Options for creating a status handler. */
interface CreateStatusHandlerOptions {
    /** Component name (e.g., 'watcher'). */
    name: string;
    /** Component version. */
    version: string;
    /** Optional callback returning component-specific health details. */
    getHealth?: () => Promise<Record<string, unknown>>;
}
/** Standard status response body. */
interface StatusResponse {
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
interface StatusHandlerResult {
    /** HTTP status code. */
    status: number;
    /** Response body. */
    body: StatusResponse;
}
/** Status handler function signature. */
type StatusHandler = () => Promise<StatusHandlerResult>;
/**
 * Create a framework-agnostic status handler.
 *
 * @param options - Handler configuration.
 * @returns An async function returning `{ status, body }`.
 */
declare function createStatusHandler(options: CreateStatusHandlerOptions): StatusHandler;

/**
 * Runtime Node.js version floor check.
 *
 * @module
 */
/**
 * Check that the running Node.js version meets the minimum requirement.
 * Prints an error and exits with code 1 if the check fails.
 */
declare function checkNodeVersion(): void;

/**
 * @packageDocumentation
 *
 * Deep-walks config objects and replaces `${VAR_NAME}` patterns with environment variable values.
 * Canonical implementation in `@karmaniverous/jeeves` (jeeves-core).
 */
/**
 * Deep-walk a value and substitute `${VAR_NAME}` patterns in all string values.
 *
 * @param value - The value to walk (object, array, or primitive).
 * @returns A new value with all env var references resolved.
 */
declare function substituteEnvVars<T>(value: T): T;

/**
 * Workspace-level shared configuration: `jeeves.config.json`.
 *
 * @remarks
 * Lives at the OpenClaw workspace root alongside SOUL.md and AGENTS.md.
 * Provides namespaced shared defaults consumed by the root Jeeves CLI.
 * Resolution precedence: CLI flags → env vars → jeeves.config.json → defaults.
 *
 * This does not replace component-owned config schemas (Decision 41).
 *
 * @module
 */

/** Workspace config file name. */
declare const WORKSPACE_CONFIG_FILE = "jeeves.config.json";
/** Workspace config Zod schema. */
declare const workspaceConfigSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    core: z.ZodOptional<z.ZodObject<{
        workspace: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        configRoot: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        gatewayUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
        devRepos: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>>;
    }, z.core.$strip>>;
    memory: z.ZodOptional<z.ZodObject<{
        budget: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
        warningThreshold: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Workspace config type. */
type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
/**
 * Built-in workspace config defaults.
 *
 * @remarks
 * These defaults are used as the lowest-priority tier in config resolution
 * (below CLI flags, env vars, and `jeeves.config.json` values).
 */
declare const WORKSPACE_CONFIG_DEFAULTS: {
    /** Core shared defaults. */
    readonly core: {
        /** Default workspace root path. */
        readonly workspace: '.';
        /** Default platform config root path. */
        readonly configRoot: './config';
        /** Default OpenClaw gateway URL. */
        readonly gatewayUrl: 'http://127.0.0.1:3000';
    };
    /** Memory hygiene shared defaults. */
    readonly memory: {
        /** Default MEMORY.md character budget. */
        readonly budget: 20_000;
        /** Default warning threshold as a fraction of budget (80%). */
        readonly warningThreshold: 0.8;
    };
};
/** Provenance source for a resolved config value. */
type ConfigProvenance = 'flag' | 'env' | 'file' | 'default';
/** A resolved config value with provenance. */
interface ResolvedValue<T> {
    /** The resolved value. */
    value: T;
    /** Where the value came from. */
    provenance: ConfigProvenance;
}
/**
 * Load workspace config from `jeeves.config.json` at a given path.
 *
 * @param workspacePath - Workspace root directory.
 * @returns Parsed config or undefined if missing or invalid.
 */
declare function loadWorkspaceConfig(workspacePath: string): WorkspaceConfig | undefined;
/**
 * Resolve a config value with four-tier precedence.
 *
 * @param flagValue - CLI flag value (highest priority).
 * @param envValue - Environment variable value.
 * @param fileValue - Value from jeeves.config.json.
 * @param defaultValue - Built-in default (lowest priority).
 * @returns The resolved value with provenance annotation.
 */
declare function resolveConfigValue<T>(flagValue: T | undefined, envValue: T | undefined, fileValue: T | undefined, defaultValue: T): ResolvedValue<T>;
/**
 * Generate a JSON Schema for the workspace config.
 *
 * @returns A JSON Schema object.
 */
declare function generateWorkspaceJsonSchema(): Record<string, unknown>;

/**
 * Shared CLI defaults and resolution for Jeeves CLI commands.
 *
 * @remarks
 * All root CLI commands share workspace/config-root resolution. Values follow
 * the shared precedence model: flags → env → jeeves.config.json → defaults.
 */

/** Standard workspace options parsed from CLI. */
interface WorkspaceOptions {
    /** Workspace root path. */
    workspace?: string;
    /** Platform config root path. */
    configRoot?: string;
}
/** Resolved shared CLI config with provenance. */
interface ResolvedCliConfig {
    /** Core shared config. */
    core: {
        /** Resolved workspace root path. */
        workspace: ResolvedValue<string>;
        /** Resolved platform config root path. */
        configRoot: ResolvedValue<string>;
        /** Resolved OpenClaw gateway URL. */
        gatewayUrl: ResolvedValue<string>;
    };
    /** Memory shared config. */
    memory: {
        /** Resolved MEMORY.md character budget. */
        budget: ResolvedValue<number>;
        /** Resolved warning threshold as a fraction of budget. */
        warningThreshold: ResolvedValue<number>;
    };
}

/**
 * `jeeves config [jsonpath]` — inspect effective shared CLI configuration.
 *
 * @remarks
 * Shows effective values and provenance using the shared precedence model.
 * Optional JSONPath filters the resolved config tree.
 */

/**
 * Build the effective shared CLI config tree.
 *
 * @param opts - Parsed CLI workspace/config-root options.
 * @returns Effective config tree with provenance on each leaf.
 */
declare function buildEffectiveConfig(opts: WorkspaceOptions): ResolvedCliConfig;

/**
 * Factory for the standard Jeeves service CLI.
 *
 * @remarks
 * Produces a Commander program with all standard commands from
 * a component descriptor. Components add domain-specific commands
 * via `descriptor.customCliCommands`.
 */

/**
 * Create a standard service CLI program from a component descriptor.
 *
 * @remarks
 * Standard commands:
 * - `start -c <path>` - Launch the service process (foreground)
 * - `status [-p port]` - Probe service health
 * - `config [jsonpath] [-p port]` - Query running config (jsonpath optional)
 * - `config validate -c <path>` - Validate a config file
 * - `config apply [-p port] [--file path] [--replace]` - Apply config patch
 * - `init [-o path]` - Generate default config
 * - `service install` - Install system service
 * - `service uninstall` - Uninstall system service
 * - `service start` - Start system service
 * - `service stop` - Stop system service
 * - `service restart` - Restart system service
 * - `service status` - Query system service state
 *
 * @param descriptor - The component descriptor.
 * @returns A Commander program ready for custom commands and `.parse()`.
 */
declare function createServiceCli(descriptor: JeevesComponentDescriptor): Command;

/**
 * Platform component registry.
 *
 * @remarks
 * The four essential components that constitute the Jeeves platform.
 *
 * @module
 */
/** The four essential platform components. */
declare const PLATFORM_COMPONENTS: readonly ["runner", "watcher", "server", "meta"];
/** A platform component name. */
type PlatformComponent = (typeof PLATFORM_COMPONENTS)[number];

/**
 * Comment markers delimiting Jeeves managed content blocks in SOUL.md and AGENTS.md.
 *
 * @remarks
 * Managed content is enclosed in HTML comment markers so that re-rendering by
 * `jeeves install` can replace the Jeeves block in place while leaving user content
 * outside the markers untouched. Marker text is unchanged from v0.x so that
 * blocks written by earlier versions are recognised and replaced.
 *
 * @module
 */
/** Shape of a managed content marker set. */
interface ManagedMarkers {
    /** BEGIN comment marker text. */
    begin: string;
    /** END comment marker text. */
    end: string;
    /** Optional H1 title prepended inside the managed block. */
    title?: string;
    /**
     * Position of a newly inserted managed block within the file.
     * - `'top'`: managed block first, user content below.
     * - `'bottom'`: user content first, managed block at end.
     *
     * @defaultValue `'top'`
     */
    position?: 'top' | 'bottom';
}
/** Markers for the SOUL.md managed block. */
declare const SOUL_MARKERS: ManagedMarkers;
/** Markers for the AGENTS.md managed block. */
declare const AGENTS_MARKERS: ManagedMarkers;
/**
 * Markers for the legacy (v0.x) TOOLS.md managed block.
 *
 * @remarks
 * OpenClaw 2026.9.6 no longer loads TOOLS.md, and Jeeves no longer writes it.
 * Retained only so that tooling can recognise and strip blocks written by
 * earlier versions (e.g. `jeeves uninstall`).
 */
declare const LEGACY_TOOLS_MARKERS: ManagedMarkers;
/**
 * Regex pattern to extract the version stamp from a BEGIN marker comment.
 *
 * @remarks
 * Format: `\<!-- BEGIN MARKER | core:X.Y.Z | ISO-TIMESTAMP --\>`
 * Captures: [1] marker text, [2] version, [3] timestamp
 */
declare const VERSION_STAMP_PATTERN: RegExp;

/**
 * Directory and file path conventions for the Jeeves platform.
 *
 * @module
 */
/** Core config directory name within the config root. */
declare const CORE_CONFIG_DIR = "jeeves-core";
/** Prefix for component config directories: `jeeves-{name}`. */
declare const COMPONENT_CONFIG_PREFIX = "jeeves-";
/** Workspace file names that Jeeves renders into or reads. */
declare const WORKSPACE_FILES: {
    /** SOUL.md — professional discipline and behavioral foundations. */
    readonly soul: "SOUL.md";
    /** AGENTS.md — operational protocols. */
    readonly agents: "AGENTS.md";
    /** MEMORY.md — curated long-term memory. */
    readonly memory: "MEMORY.md";
    /**
     * TOOLS.md — legacy (v0.x) only. No longer loaded by OpenClaw and no longer
     * written by Jeeves; retained so tooling can strip legacy managed blocks.
     */
    readonly legacyTools: "TOOLS.md";
};
/** Core config file name. */
declare const CONFIG_FILE = "config.json";

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
declare const SERVER_PORT = 1934;
/** Default port for jeeves-watcher. */
declare const WATCHER_PORT = 1936;
/** Default port for jeeves-runner. */
declare const RUNNER_PORT = 1937;
/** Default port for jeeves-meta. */
declare const META_PORT = 1938;
/** Map of service names to their default ports. */
declare const DEFAULT_PORTS: Record<string, number>;

/**
 * Core library version, inlined at build time.
 *
 * @remarks
 * The `__JEEVES_CORE_VERSION__` placeholder is replaced by
 * `@rollup/plugin-replace` during the build with the actual version
 * from `package.json`. This ensures the correct version survives
 * when consumers bundle core into their own dist (where runtime
 * `import.meta.url`-based resolution would find the wrong package.json).
 */
/** The core library version from package.json (inlined at build time). */
declare const CORE_VERSION: string;

/**
 * Core configuration schema and resolution.
 *
 * @remarks
 * Core config lives at `{configRoot}/jeeves-core/config.json`.
 * Config resolution order:
 * 1. Component's own config file
 * 2. Core config file
 * 3. Hardcoded library defaults
 *
 * Unknown keys are stripped on parse, so files that still carry retired
 * keys (e.g. v0.x `registryCache`) keep validating.
 *
 * @module
 */

/** Default bind address for all Jeeves services. */
declare const DEFAULT_BIND_ADDRESS = "0.0.0.0";
/** Zod schema for the core config file. */
declare const coreConfigSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    owners: z.ZodDefault<z.ZodArray<z.ZodString>>;
    bindAddress: z.ZodDefault<z.ZodString>;
    services: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        url: z.ZodURL;
    }, z.core.$strip>>>;
}, z.core.$strip>;
/** Core config type derived from the Zod schema. */
type CoreConfig = z.infer<typeof coreConfigSchema>;
/**
 * Generate a JSON Schema from the Zod schema for `$schema` pointer support.
 *
 * @returns A JSON Schema object.
 */
declare function generateJsonSchema(): Record<string, unknown>;

/**
 * Resolve the bind address for a Jeeves service.
 *
 * @remarks
 * Resolution order (four-tier):
 * 1. Component config `bindAddress` field (if componentName provided)
 * 2. Core config `bindAddress` field
 * 3. `JEEVES_BIND_ADDRESS` environment variable
 * 4. Default: `0.0.0.0`
 */
/**
 * Resolve the bind address for a Jeeves service.
 *
 * @param componentName - Optional component name for component-specific override.
 * @returns The resolved bind address.
 */
declare function getBindAddress(componentName?: string): string;

/**
 * Platform-aware service state detection.
 *
 * @remarks
 * Detects whether a system service is installed and running.
 * Delegates to NSSM (Windows), systemd (Linux), or launchd (macOS).
 * On Linux an existing system unit takes precedence over a user unit
 * (see `getSystemdServiceState`).
 */
/** Service states returned by getServiceState. */
type ServiceState = 'not_installed' | 'stopped' | 'running';
/**
 * Detect the state of a system service by name.
 *
 * @param serviceName - The service name (e.g., 'jeeves-runner').
 * @returns The detected service state.
 */
declare function getServiceState(serviceName: string): ServiceState;

/**
 * Service URL resolution.
 *
 * @remarks
 * Resolves the URL for a named Jeeves service using the following
 * resolution order:
 * 1. Consumer's own component config
 * 2. Core config (`{configRoot}/jeeves-core/config.json`)
 * 3. Default port constants
 */
/**
 * Resolve the URL for a named Jeeves service.
 *
 * @param serviceName - The service name (e.g., 'watcher', 'runner').
 * @param consumerName - Optional consumer component name for config override.
 * @returns The resolved service URL.
 * @throws Error if `init()` has not been called or the service is unknown.
 */
declare function getServiceUrl(serviceName: string, consumerName?: string): string;

/**
 * Detailed service status: state plus the unit and scope it was read from.
 *
 * @module
 */

/** Where a service unit lives. */
type ServiceScope = 'system' | 'user';
/** Service status, naming the unit it was read from. */
interface ServiceStatus {
    /** Coarse state (kept for compatibility with `ServiceManager.status`). */
    state: ServiceState;
    /** Whether a unit/service registration was found. */
    installed: boolean;
    /** Whether the service is running. */
    running: boolean;
    /**
     * Scope the status was read from: `system` (e.g. a systemd system unit or
     * a Windows service) or `user` (a systemd user unit or a launchd agent).
     * Absent when nothing is installed.
     */
    scope?: ServiceScope;
    /**
     * Unit that was queried: the systemd unit (`jeeves-runner.service`), the
     * NSSM service name or the launchd label.
     */
    unit: string;
}

/**
 * Workspace and config root initialization.
 *
 * @remarks
 * `init()` must be called once before any other core library functions.
 * It caches `workspacePath` and `configRoot` at module level.
 * Core derives all namespaced paths from these values:
 * - `{configRoot}/jeeves-core/` for core config
 * - `{configRoot}/jeeves-{name}/` for each component
 */
/** Options for initializing the core library. */
interface InitOptions {
    /** Absolute path to the OpenClaw workspace root. */
    workspacePath: string;
    /** Absolute path to the platform config root. */
    configRoot: string;
}
/**
 * Throw if a path looks like a Windows drive letter on a non-Windows platform.
 *
 * @param label - Human-readable name for the path (used in error messages).
 * @param value - The raw path string to validate.
 */
declare function rejectWindowsDrivePath(label: string, value: string): void;
/**
 * Initialize the core library with workspace and config root paths.
 *
 * @param options - Workspace and config root paths.
 */
declare function init(options: InitOptions): void;
/**
 * Get the cached workspace path.
 *
 * @throws Error if `init()` has not been called.
 */
declare function getWorkspacePath(): string;
/**
 * Get the cached config root path.
 *
 * @throws Error if `init()` has not been called.
 */
declare function getConfigRoot(): string;
/**
 * Get the core config directory path.
 *
 * @throws Error if `init()` has not been called.
 */
declare function getCoreConfigDir(): string;
/**
 * Get the core config file path.
 *
 * @throws Error if `init()` has not been called.
 */
declare function getCoreConfigFile(): string;
/**
 * Derive the component config directory from the component name.
 *
 * @param componentName - The component name (e.g., 'watcher', 'runner').
 * @returns Absolute path to the component's config directory.
 * @throws Error if `init()` has not been called.
 */
declare function getComponentConfigDir(componentName: string): string;
/**
 * Register the actual config file path for a component.
 *
 * @remarks
 * Call this after resolving the `--config` CLI argument so that
 * `getComponentConfigPath` returns the real file location instead of
 * the default derived from `configRoot`.
 *
 * @param componentName - The component name (e.g., 'watcher', 'runner').
 * @param absolutePath - Absolute path to the component's config file.
 * @throws Error if `init()` has not been called.
 */
declare function registerComponentConfigPath(componentName: string, absolutePath: string): void;
/**
 * Get the registered config file path for a component, or `undefined`
 * if no override has been registered.
 *
 * @param componentName - The component name.
 * @returns The registered absolute path, or `undefined`.
 * @throws Error if `init()` has not been called.
 */
declare function getComponentConfigPath(componentName: string): string | undefined;
/**
 * Reset initialization state. Used for testing only.
 */
declare function resetInit(): void;

/**
 * Cross-process advisory file lock using an atomic `mkdir` of `{file}.lock`.
 *
 * @remarks
 * Replaces `proper-lockfile`, whose `signal-exit` dependency registered
 * process-level SIGINT/SIGTERM/... handlers at import time in every process
 * that loaded this library (including the OpenClaw gateway and CLI, via the
 * Jeeves plugins). This implementation registers no process handlers and
 * starts no timers, so it cannot keep a process alive.
 *
 * The lock directory name (`{file}.lock`) matches proper-lockfile's
 * convention, so v0.x holders and this implementation exclude each other
 * during a mixed-version rollout. A lock whose mtime is older than
 * {@link STALE_LOCK_MS} is considered abandoned and is taken over; takeovers
 * are serialised through a `{file}.lock.takeover` guard so a freshly
 * re-taken lock is never deleted. The lock's mtime is not refreshed while it
 * is held (that would need a timer), so callbacks must finish well within
 * the stale threshold: they are meant to be a short read-modify-write.
 *
 * @module
 */
/** Stale lock threshold in ms (2 minutes). */
declare const STALE_LOCK_MS = 120000;
/**
 * Execute a callback while holding an exclusive lock on a file.
 *
 * @remarks
 * Fails fast (no retries) with an `ELOCKED` error when the lock is held,
 * matching the v0.x behaviour. The lock is always released in a `finally`
 * block. The target file need not exist. `fn` must complete well within
 * `staleMs`: the lock is not refreshed while held, so a longer callback can
 * be taken over by another process.
 *
 * @param filePath - Absolute path to the file to lock.
 * @param fn - Callback to execute while holding the lock.
 * @param staleMs - Stale threshold in ms. Defaults to {@link STALE_LOCK_MS}.
 */
declare function withFileLock(filePath: string, fn: () => void | Promise<void>, staleMs?: number): Promise<void>;

/**
 * Atomic file write (temp file + rename) with Windows EPERM retry.
 *
 * @remarks
 * Synchronous; touches only the target directory. Used by service-side config
 * persistence and by `jeeves install`.
 *
 * @module
 */
/**
 * Write content to a file atomically via a temp file + rename.
 *
 * @remarks
 * Retries the rename up to three times on EPERM (Windows file-handle
 * contention) with a 100 ms synchronous delay between attempts.
 *
 * When `options.mode` is given, the temp file gets exactly that mode before
 * the rename (so a secret-bearing file is never visible with wider
 * permissions); on Windows only the read-only bit is affected.
 *
 * @param filePath - Absolute path to the target file.
 * @param content - Content to write.
 * @param options - Optional file mode for the written file.
 */
declare function atomicWrite(filePath: string, content: string, options?: {
    mode?: number;
}): void;

/**
 * Pure string transforms that render, insert, replace, and remove a Jeeves
 * managed block in workspace file content. No I/O.
 *
 * @remarks
 * Used by `jeeves install` / `jeeves uninstall`; exported for any tool that
 * edits a managed block with its own marker set. An existing block is replaced in
 * place; a new block is inserted at the marker set's configured position.
 * User content outside the markers is preserved verbatim (trimmed).
 *
 * @module
 */

/** Options controlling the version stamp on a rendered BEGIN marker. */
interface ManagedBlockStampOptions {
    /** Core library version written into the stamp. */
    version: string;
    /** Render time written into the stamp. Defaults to now. */
    now?: Date;
}
/**
 * Format the BEGIN marker comment with a version stamp.
 *
 * @param markerText - The marker text.
 * @param version - The core library version.
 * @param now - Render time. Defaults to now.
 * @returns Formatted comment line.
 */
declare function formatBeginMarker(markerText: string, version: string, now?: Date): string;
/**
 * Format the END marker comment.
 *
 * @param markerText - The marker text.
 * @returns Formatted comment line.
 */
declare function formatEndMarker(markerText: string): string;
/**
 * Render a complete managed block (BEGIN marker, optional H1 title, body,
 * END marker).
 *
 * @param markers - Marker set.
 * @param body - Managed body (Markdown).
 * @param stamp - Version stamp options.
 * @returns The managed block, without a trailing newline.
 */
declare function renderManagedBlock(markers: ManagedMarkers, body: string, stamp: ManagedBlockStampOptions): string;
/**
 * Insert or replace the managed block in file content.
 *
 * @remarks
 * If a block with these markers exists, it is replaced in place. Otherwise
 * the block is inserted at `markers.position` (default `'top'`), and any
 * orphaned BEGIN marker of the same type is stripped from user content so it
 * cannot pair with the new END marker later.
 *
 * @param fileContent - Existing file content (empty string for a new file).
 * @param markers - Marker set.
 * @param body - Managed body (Markdown).
 * @param stamp - Version stamp options.
 * @returns The new file content.
 */
declare function upsertManagedBlock(fileContent: string, markers: ManagedMarkers, body: string, stamp: ManagedBlockStampOptions): string;
/**
 * Remove the managed block from file content, keeping user content.
 *
 * @param fileContent - Existing file content.
 * @param markers - Marker set.
 * @returns The new file content (unchanged if no block is present).
 */
declare function removeManagedBlock(fileContent: string, markers: Pick<ManagedMarkers, 'begin' | 'end'>): string;

/**
 * Parse a Jeeves managed block out of workspace file content (pure).
 *
 * @remarks
 * Locates the BEGIN/END comment markers, extracts the managed content and its
 * version stamp, and returns the user content before and after the block.
 *
 * @module
 */

/** Version stamp extracted from the BEGIN marker. */
interface VersionStamp {
    /** Core library version (semver). */
    version: string;
    /** ISO timestamp of the render. */
    timestamp: string;
}
/** Result of parsing a managed block from file content. */
interface ParseManagedResult {
    /** Whether a valid BEGIN/END marker pair was found. */
    found: boolean;
    /** Version stamp from the BEGIN marker, if present. */
    versionStamp: VersionStamp | undefined;
    /** Raw managed block content (between markers, excluding markers). */
    managedContent: string;
    /** Content before the BEGIN marker (trimmed). */
    beforeContent: string;
    /** Content after the END marker (trimmed), or the whole file if not found. */
    userContent: string;
    /**
     * Character range of the whole block, BEGIN marker through END marker
     * (`end` exclusive), when found.
     */
    blockRange?: {
        /** Index of the BEGIN marker's first character. */
        start: number;
        /** Index just past the END marker's closing `-->`. */
        end: number;
    };
}
/**
 * Parse a managed block from file content.
 *
 * @param fileContent - Full file content.
 * @param markers - BEGIN/END marker pair to look for.
 * @returns Parsed result with version stamp and surrounding user content.
 */
declare function parseManaged(fileContent: string, markers: Pick<ManagedMarkers, 'begin' | 'end'>): ParseManagedResult;

/**
 * Memory budget accounting for MEMORY.md.
 *
 * @remarks
 * Reports character count against a configured budget and warning threshold
 * state. Does not auto-delete: review remains human- or agent-mediated
 * (Decision 42). Staleness detection removed in v0.5.9 (Decision 45).
 */
/** Result of memory hygiene analysis. */
interface MemoryHygieneResult {
    /** Whether MEMORY.md exists. */
    exists: boolean;
    /** Total character count. */
    charCount: number;
    /** Configured budget in characters. */
    budget: number;
    /** Usage as a fraction of budget (0–1+). */
    usage: number;
    /** Whether usage exceeds the warning threshold. */
    warning: boolean;
    /** Whether usage exceeds the budget. */
    overBudget: boolean;
}
/** Options for memory hygiene analysis. */
interface MemoryHygieneOptions {
    /** Workspace root path. */
    workspacePath: string;
    /** Character budget. */
    budget: number;
    /** Warning threshold as a fraction of budget (0–1). */
    warningThreshold: number;
}
/**
 * Analyze MEMORY.md for budget health.
 *
 * @param options - Analysis configuration.
 * @returns Memory hygiene result.
 */
declare function analyzeMemory(options: MemoryHygieneOptions): MemoryHygieneResult;

/**
 * Build/test-time check that a plugin's `package.json` declares the OpenClaw
 * conversation hooks it registers (e.g. via `registerPromptContext`), as
 * `"jeeves": { "conversationHooks": [...] }`. Pure apart from calling the
 * plugin's own `register` with a recording API.
 *
 * @remarks
 * OpenClaw blocks every conversation hook of a non-bundled plugin unless
 * `plugins.entries.<id>.hooks.allowConversationAccess` is `true`, and it has
 * no static record of the typed hooks a plugin registers. `jeeves install` /
 * `jeeves update` therefore grant access only to plugins whose `package.json`
 * declares such hooks. A plugin that registers one without declaring it
 * installs cleanly and then silently never runs the hook, so plugins should
 * run {@link validateConversationHooks} in a test or build step:
 *
 * ```typescript
 * const hooks = await recordRegisteredHooks(register);
 * validateConversationHooks(JSON.parse(readFileSync('package.json', 'utf-8')), hooks);
 * ```
 *
 * @module
 */

/**
 * OpenClaw's conversation hooks: the typed hooks gated by
 * `allowConversationAccess` (v2026.9.6 `src/plugins/hook-types.ts`
 * `CONVERSATION_HOOK_NAMES`).
 */
declare const CONVERSATION_HOOK_NAMES: readonly string[];
/**
 * Run a plugin's `register(api)` against a recording API and return the
 * typed hook names it registers with `api.on` (e.g. `before_prompt_build`
 * from `registerPromptContext`).
 *
 * @param register - The plugin's register function.
 * @param api - Extra API members the plugin needs at registration (config,
 *   logger, ...). `on` is always the recorder; `registerTool` defaults to a
 *   no-op.
 * @returns Registered hook names, in registration order.
 */
declare function recordRegisteredHooks(register: (api: PluginApi) => unknown, api?: Partial<PluginApi>): Promise<string[]>;
/**
 * Check that `package.json` declares exactly the conversation hooks a plugin
 * registers.
 *
 * @param packageJson - Parsed `package.json` of the plugin package.
 * @param registeredHooks - Hook names the plugin registers (see
 *   {@link recordRegisteredHooks}); non-conversation hooks are ignored.
 * @returns The declared conversation hooks.
 * @throws Error when the field is malformed, a registered conversation hook
 *   is not declared, or a declared hook is not a registered conversation hook.
 */
declare function validateConversationHooks(packageJson: unknown, registeredHooks: readonly string[]): string[];

/**
 * Service base URL resolution for plugin tools.
 *
 * @remarks
 * Plugin tools must call the service at the plugin's configured `apiUrl`
 * (`plugins.entries.<id>.config.apiUrl`). The descriptor's `defaultPort`
 * is only the fallback when no `apiUrl` is set.
 */

/**
 * Lazy `apiUrl` resolver, evaluated on every tool call (so a plugin can
 * read its config at call time, like `configRoot`).
 */
type PluginApiUrlResolver = () => string | undefined;
/** Options for {@link createPluginToolset}. */
declare const pluginToolsetOptionsSchema: z.ZodObject<{
    apiUrl: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<PluginApiUrlResolver, PluginApiUrlResolver>]>>;
}, z.core.$strip>;
/** Options for {@link createPluginToolset}. */
type PluginToolsetOptions = z.infer<typeof pluginToolsetOptionsSchema>;

/**
 * Factory for the standard plugin tool set.
 *
 * @remarks
 * Produces four standard tools from a component descriptor:
 * - `{name}_status` - Probe service health + version + uptime
 * - `{name}_config` - Query running config with optional JSONPath
 * - `{name}_config_apply` - Push config patch to running service
 * - `{name}_service` - Service lifecycle management
 *
 * The HTTP tools call the plugin's configured `apiUrl` (see
 * {@link PluginToolsetOptions}); the descriptor's `defaultPort` is only the
 * fallback when `apiUrl` is unset.
 *
 * Components add domain-specific tools separately.
 */

/**
 * Create the standard plugin tool set from a component descriptor.
 *
 * @param descriptor - The component descriptor.
 * @param options - Tool options (required, so each plugin consciously
 *   chooses its service URL). Pass the plugin's `apiUrl` (string or lazy
 *   resolver); with `apiUrl` unset, the tools call
 *   `http://127.0.0.1:<defaultPort>`.
 * @returns Array of tool descriptors to register.
 */
declare function createPluginToolset(descriptor: JeevesComponentDescriptor, options: PluginToolsetOptions): ToolDescriptor[];

/**
 * Resolve the package root directory from a module's `import.meta.url`.
 *
 * @module
 */
/**
 * Get the nearest package root directory relative to the calling module URL.
 *
 * @param importMetaUrl - The `import.meta.url` of the calling module.
 * @returns The absolute package root path, or `undefined` on any error.
 */
declare function getPackageRoot(importMetaUrl: string): string | undefined;

/**
 * Resolve the version of a package from its `import.meta.url`.
 *
 * @module
 */
/**
 * Get the version string from the nearest `package.json` relative to the
 * caller's module URL.
 *
 * @param importMetaUrl - The `import.meta.url` of the calling module.
 * @returns The `version` field, or `'unknown'` on any error.
 */
declare function getPackageVersion(importMetaUrl: string): string;

/**
 * HTTP helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Thin wrappers around `fetch` that throw on non-OK responses
 * and handle JSON serialisation/deserialisation. The JSON helpers abort
 * after {@link DEFAULT_FETCH_TIMEOUT_MS} unless the caller passes its own
 * `signal` or a `timeoutMs` override, so a service that accepts the
 * connection but never answers cannot hang a plugin tool call.
 */
/**
 * Default timeout for {@link fetchJson} and {@link postJson}, in
 * milliseconds (2 minutes): long enough for the slowest existing caller
 * (jeeves-server export, OAuth and meta synthesis calls), short enough
 * that a stalled service cannot hold a call open indefinitely.
 */
declare const DEFAULT_FETCH_TIMEOUT_MS = 120000;
/** Options for {@link fetchJson} and {@link postJson}. */
interface FetchJsonOptions {
    /**
     * Abort after this many milliseconds (default
     * {@link DEFAULT_FETCH_TIMEOUT_MS}). Ignored when `init.signal` is set:
     * a caller-supplied signal always wins.
     */
    timeoutMs?: number;
}
/**
 * Fetch a URL with an automatic abort timeout.
 *
 * @param url - URL to fetch.
 * @param timeoutMs - Timeout in milliseconds before aborting.
 * @param init - Optional `fetch` init options.
 * @returns The fetch Response object.
 */
declare function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response>;
/**
 * Fetch JSON from a URL, throwing on non-OK responses.
 *
 * @param url - URL to fetch.
 * @param init - Optional `fetch` init options. A `signal` here is used
 *   as-is and replaces the default timeout.
 * @param options - Per-call options (`timeoutMs`).
 * @returns Parsed JSON response body.
 * @throws Error with `HTTP {status}: {body}` message on non-OK responses.
 * @throws The abort error when the timeout (or the caller's signal) fires.
 */
declare function fetchJson(url: string, init?: RequestInit, options?: FetchJsonOptions): Promise<unknown>;
/**
 * POST JSON to a URL and return parsed response.
 *
 * @param url - URL to POST to.
 * @param body - Request body (will be JSON-stringified).
 * @param options - Per-call options (`timeoutMs`).
 * @returns Parsed JSON response body.
 */
declare function postJson(url: string, body: unknown, options?: FetchJsonOptions): Promise<unknown>;

/**
 * Tie plugin-owned resources (timers, sockets, clients) to the OpenClaw
 * plugin lifecycle so a process that loads the plugin can exit.
 *
 * @remarks
 * Plugins must not install process-level signal handlers or leave live
 * timers/handles behind: `openclaw plugins inspect` and other CLI commands
 * load plugin code and must exit on their own, and the gateway force-retires
 * plugins that do not release work on shutdown (runbook S1).
 *
 * @module
 */

/**
 * Register a disposer with the host plugin lifecycle.
 *
 * @remarks
 * Prefers `api.lifecycle.onDispose` (instance retirement); falls back to
 * `api.lifecycle.registerRuntimeLifecycle({ id, dispose })`.
 *
 * @param api - The OpenClaw plugin API passed to `register(api)`.
 * @param id - Stable id for the resource (used by the fallback path).
 * @param dispose - Releases the resource. Must be idempotent.
 * @returns `true` if registered; `false` if the host exposes no lifecycle API
 *   (the caller should then avoid starting long-lived work).
 */
declare function onPluginDispose(api: PluginApi, id: string, dispose: () => void | Promise<void>): boolean;

/**
 * Register always-in-context plugin rules via OpenClaw's `before_prompt_build`
 * hook, returning `{ appendSystemContext }` (never `systemPrompt`).
 *
 * @remarks
 * Runbook D5 / spike S2: `appendSystemContext` is appended after the prompt
 * cache boundary, concatenated across plugins in priority order, and does not
 * count toward `bootstrapMaxChars`. `systemPrompt` would replace the whole
 * prompt, so the result type here cannot express it.
 *
 * **Host config gate:** OpenClaw only runs this hook for non-bundled plugins
 * when `plugins.entries.<id>.hooks.allowConversationAccess` is `true`.
 * `openclaw plugins install --accept-capabilities` does NOT set it;
 * `jeeves install` / `jeeves update` grant it to plugins that declare the
 * hook in `package.json` `jeeves.conversationHooks`.
 *
 * @module
 */

/** Produces prompt context text; empty/undefined means "inject nothing". */
type PromptContextProvider = (ctx: PromptBuildContext) => string | undefined | Promise<string | undefined>;
/** Zod schema for {@link registerPromptContext} options. */
declare const promptContextOptionsSchema: z.ZodObject<{
    content: z.ZodUnion<readonly [z.ZodString, z.ZodCustom<PromptContextProvider, PromptContextProvider>]>;
    priority: z.ZodOptional<z.ZodNumber>;
    registrationId: z.ZodOptional<z.ZodString>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/** Options for {@link registerPromptContext}. */
type PromptContextOptions = z.infer<typeof promptContextOptionsSchema>;
/**
 * Register plugin rules that must always be in the agent's context.
 *
 * @remarks
 * Provider errors are logged (via `api.logger` when present) and yield no
 * injection for that turn; they never fail the prompt build. Registers no
 * timers or process handlers.
 *
 * @example
 * ```typescript
 * export default function register(api: PluginApi): void {
 *   registerPromptContext(api, { content: WATCHER_RULES, priority: 10 });
 * }
 * ```
 *
 * @param api - The OpenClaw plugin API passed to `register(api)`.
 * @param options - Content and registration options.
 * @returns `true` if registered; `false` if the host has no `api.on`.
 * @throws ZodError if options are invalid.
 */
declare function registerPromptContext(api: PluginApi, options: PromptContextOptions): boolean;

/**
 * Plugin resolution helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Provides workspace path resolution and plugin setting resolution
 * with a standard three-step fallback chain:
 * plugin config → environment variable → default value.
 */

/**
 * Resolve the workspace root from the OpenClaw plugin API.
 *
 * @remarks
 * Tries three sources in order:
 * 1. `api.config.agents.defaults.workspace` — explicit config
 * 2. `api.resolvePath('.')` — gateway-provided path resolver
 * 3. `process.cwd()` — last resort
 *
 * @param api - The plugin API object provided by the gateway.
 * @returns Absolute path to the workspace root.
 */
declare function resolveWorkspacePath(api: PluginApi): string;
/**
 * Resolve a plugin setting via the standard three-step fallback chain:
 * plugin config → environment variable → fallback value.
 *
 * @param api - Plugin API object.
 * @param pluginId - Plugin identifier (e.g., 'jeeves-watcher-openclaw').
 * @param key - Config key within the plugin's config object.
 * @param envVar - Environment variable name.
 * @param fallback - Default value if neither source provides one.
 * @returns The resolved setting value.
 */
declare function resolvePluginSetting(api: PluginApi, pluginId: string, key: string, envVar: string, fallback: string): string;
/**
 * Resolve an optional plugin setting via the two-step fallback chain:
 * plugin config → environment variable. Returns `undefined` if neither
 * source provides a value.
 *
 * @param api - Plugin API object.
 * @param pluginId - Plugin identifier (e.g., 'jeeves-watcher-openclaw').
 * @param key - Config key within the plugin's config object.
 * @param envVar - Environment variable name.
 * @returns The resolved setting value, or `undefined`.
 */
declare function resolveOptionalPluginSetting(api: PluginApi, pluginId: string, key: string, envVar: string): string | undefined;

/**
 * Tool result formatters for the OpenClaw plugin SDK.
 *
 * @remarks
 * Provides standardised helpers for building `ToolResult` objects:
 * success, error, and connection-error variants.
 */

/**
 * Format a successful tool result.
 *
 * @param data - Arbitrary data to return as JSON.
 * @returns A `ToolResult` with JSON-stringified content.
 */
declare function ok(data: unknown): ToolResult;
/**
 * Format an error tool result.
 *
 * @param error - Error instance, string, or other value.
 * @returns A `ToolResult` with `isError: true`.
 */
declare function fail(error: unknown): ToolResult;
/**
 * Format a connection error with actionable guidance.
 *
 * @remarks
 * Detects `ECONNREFUSED`, `ENOTFOUND`, and `ETIMEDOUT` from
 * `error.cause.code` and returns a user-friendly message referencing
 * the plugin's `config.apiUrl` setting. Falls back to `fail()` for
 * non-connection errors.
 *
 * @param error - Error instance (typically from `fetch`).
 * @param baseUrl - The URL that was being contacted.
 * @param pluginId - The plugin identifier for config guidance.
 * @returns A `ToolResult` with `isError: true`.
 */
declare function connectionFail(error: unknown, baseUrl: string, pluginId: string): ToolResult;

/**
 * Minimal validation of SKILL.md frontmatter (`name` and `description`).
 *
 * @remarks
 * OpenClaw skips skills without `name`/`description` frontmatter. Plugins
 * can call this from a build or test step to enforce it (runbook D4). Pure.
 *
 * @module
 */
/** Parsed required frontmatter fields. */
interface SkillFrontmatter {
    /** Skill name. */
    name: string;
    /** Skill description (block scalars are folded to one line). */
    description: string;
}
/**
 * Validate that SKILL.md content carries non-empty `name` and `description`
 * frontmatter.
 *
 * @param content - Full SKILL.md content.
 * @returns The parsed fields.
 * @throws Error describing the first missing requirement.
 */
declare function validateSkillFrontmatter(content: string): SkillFrontmatter;

/**
 * The one argument parser for runnables (root export): a typed spec of
 * bare boolean flags, valued options (`--name value` or `--name=value`,
 * optionally a short alias) and positionals, read from `ctx.args`.
 * Unknown arguments are ignored. Pure.
 *
 * @module
 */
/** A bare boolean flag: `true` when the exact name appears in the args. */
interface FlagSpec {
    /** Discriminant. */
    kind: 'flag';
    /** The flag as typed, e.g. `--live`. */
    name: string;
}
/** How a valued option may also be written. */
interface ArgValueOptions {
    /** A short alias taking its value as the next argument, e.g. `-e`. */
    alias?: string;
}
/** A valued option: its value, else the default. */
interface ValueSpec extends ArgValueOptions {
    /** Discriminant. */
    kind: 'value';
    /** The option as typed, e.g. `--project`. */
    name: string;
    /** The value when the option is absent. */
    fallback: string;
}
/** An optional valued option: its value, else `undefined`. */
interface OptionalSpec extends ArgValueOptions {
    /** Discriminant. */
    kind: 'optional';
    /** The option as typed, e.g. `--days`. */
    name: string;
}
/** A runnable's argument spec: result key to flag or option. */
type ArgSpec = Record<string, FlagSpec | ValueSpec | OptionalSpec>;
/** The parsed arguments for a spec. */
type ParsedArgs<S extends ArgSpec> = {
    [K in keyof S]: S[K] extends FlagSpec ? boolean : S[K] extends OptionalSpec ? string | undefined : string;
};
/** Declare a bare boolean flag (`--live`). `--live=true` does not set it. */
declare const argFlag: (name: string) => FlagSpec;
/** Declare a valued option with its default (`''` unless given). */
declare const argValue: (name: string, fallback?: string, options?: ArgValueOptions) => ValueSpec;
/** Declare an optional valued option (no default). */
declare const argOptional: (name: string, options?: ArgValueOptions) => OptionalSpec;
/**
 * Parse `args` (a runnable's `ctx.args`) against `spec`.
 *
 * @example
 * ```ts
 * const { live, project, days } = parseRunnableArgs(ctx.args, {
 *   live: argFlag('--live'),
 *   project: argValue('--project', 'ACME'),
 *   days: argOptional('--days', { alias: '-d' }),
 * });
 * ```
 *
 * @throws Error `<name> requires a value` when a valued option is given
 *   without one.
 */
declare function parseRunnableArgs<S extends ArgSpec>(args: readonly string[], spec: S): ParsedArgs<S>;
/**
 * The positional arguments: every argument that does not start with `-`
 * and is not the separate value of one of `spec`'s valued options (by name
 * or alias). `--name=value` is a single argument, so it never hides one.
 */
declare function positionalArgs(args: readonly string[], spec?: ArgSpec): string[];

/**
 * Shared filesystem utilities for runner job scripts.
 *
 * @module
 */
/** Return current time as ISO 8601 string. */
declare function nowIso(): string;
/** Generate a random UUID v4. */
declare function uuid(): string;
/** Create a directory and any missing parents. */
declare function ensureDir(p: string): void;
/** Read and parse a JSON file, returning `fallback` on any error. */
declare function readJson<T>(p: string, fallback: T): T;
/** Atomically write a JSON file (write to .tmp, then rename). */
declare function writeJsonAtomic(p: string, obj: unknown): void;
/** Append a single JSON object as a JSONL line. */
declare function appendJsonl(p: string, obj: unknown): void;
/** Read a JSONL file into an array of parsed objects. */
declare function readJsonl<T = unknown>(p: string): T[];
/** Overwrite a file with an array of objects as JSONL. */
declare function writeJsonl(p: string, entries: unknown[]): void;
/** Synchronous sleep using Atomics.wait. */
declare function sleepMs(ms: number): void;
/** Async sleep via setTimeout. */
declare function sleepAsync(ms: number): Promise<void>;
/** Load a .env-style key=value file into process.env. */
declare function loadEnvFile(envPath: string): void;
/**
 * Parse --key=value arguments from argv into a record.
 *
 * @remarks
 * Prefer {@link parseRunnableArgs}, which takes a declared spec, returns
 * typed values and throws when a valued option is given without a
 * value. Deprecation is planned for 0.7.1 (#127).
 */
declare function parseArgs(argv?: string[]): Record<string, string>;
/**
 * Get the value following a named flag, or a default.
 *
 * @remarks
 * Prefer {@link parseRunnableArgs}, which takes a declared spec, returns
 * typed values and throws when a valued option is given without a
 * value. Deprecation is planned for 0.7.1 (#127).
 */
declare function getArg(argv: string[], name: string, defaultValue: string): string;

/**
 * Google API auth helpers for runner job scripts.
 * Supports OAuth refresh tokens and service account impersonation.
 *
 * @module
 */
/** Service account config object specifying a key file path. */
interface ServiceAccountFileConfig {
    /** Path to the service account JSON key file. */
    file: string;
}
/** Configuration for a Google account's auth method. */
interface AccountConfig {
    /** Google account email address. */
    email: string;
    /** Path to refresh token file (relative to credentialsDir). */
    tokenFile?: string;
    /** Service account key file path or config object. */
    serviceAccount?: string | ServiceAccountFileConfig;
}
/** Options for the Google auth helper. */
interface GoogleAuthOptions {
    /** Path to the OAuth client credentials JSON file. */
    clientCredentialsPath: string;
    /** Base directory for credential files. */
    credentialsDir: string;
    /** Directory containing service account JSON files. */
    serviceAccountDir?: string;
}
/**
 * Create a Google auth helper with the given configuration.
 * Returns a function that resolves an access token for a given account and scopes.
 */
declare function createGoogleAuth(options: GoogleAuthOptions): {
    /** Get an access token for the given account and scopes. */
    getAccessToken: (account: AccountConfig, scopes: string[]) => Promise<string>;
};

/**
 * The one retry helper (async and sync forms of the same policy): try up
 * to `attempts` times, waiting `delayMs(attempt)` after a failure the
 * policy calls retryable, and rethrow the last error otherwise.
 *
 * @module
 */
/** When and how long to retry. */
interface RetryPolicy {
    /** Total tries (at least 1). */
    attempts: number;
    /** The wait after failed attempt `attempt` (1-based); default none. */
    delayMs?: (attempt: number) => number;
    /** Whether an error is worth another try; default every error. */
    isRetryable?: (err: unknown) => boolean;
    /** Called before each wait (logging). */
    onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}
/** Exponential backoff: `baseMs`, `2 * baseMs`, `4 * baseMs`, ... */
declare const exponentialBackoff: (baseMs: number) => (attempt: number) => number;
/**
 * Run `fn` (given the 1-based attempt) until it resolves or the policy
 * gives up.
 *
 * @throws RangeError when `policy.attempts` is not an integer of at least 1 (before
 *   `fn` runs).
 * @throws The last error.
 */
declare function retryAsync<T>(fn: (attempt: number) => Promise<T>, policy: RetryPolicy & {
    sleep?: (ms: number) => Promise<void>;
}): Promise<T>;
/**
 * Run `fn` synchronously until it returns or the policy gives up.
 *
 * @throws RangeError when `policy.attempts` is not an integer of at least 1 (before
 *   `fn` runs).
 * @throws The last error.
 */
declare function retrySync<T>(fn: (attempt: number) => T, policy: RetryPolicy & {
    sleep: (ms: number) => void;
}): T;

/**
 * Shared crash-handler wrapper for runner job scripts.
 * Catches uncaught errors, logs them, and exits with code 1.
 *
 * @module
 */
/**
 * Wrap a script's main function with crash handling.
 * On uncaught errors, appends to `_crash.log` in `crashDir` and exits.
 *
 * @param name - Script identifier for the crash log.
 * @param fn - Main function to execute (sync or async).
 * @param crashDir - Directory for crash logs (default: current working directory).
 */
declare function runScript(name: string, fn: () => void | Promise<void>, crashDir?: string): void;

/**
 * Shell execution utilities for runner job scripts.
 *
 * @module
 */
/** Options for synchronous command execution. */
interface RunOptions {
    /** Output encoding (default utf8). */
    encoding?: BufferEncoding;
    /** Max stdout/stderr buffer size in bytes. */
    maxBuffer?: number;
    /** Execution timeout in milliseconds. */
    timeout?: number;
    /** Run command through the shell. */
    shell?: boolean;
}
/**
 * Run a command synchronously and return trimmed stdout.
 * Throws on non-zero exit code.
 */
declare function run(cmd: string, args: string[], opts?: RunOptions): string;
/** Options for retry-enabled command execution. */
interface RetryOptions {
    /** Number of retries (default 2). */
    retries?: number;
    /** Base backoff interval in milliseconds (default 5000). */
    backoffMs?: number;
    /** Custom predicate to determine if an error is retryable. */
    isRetryable?: (error: unknown) => boolean;
}
/**
 * Run a command with automatic retries on transient failures.
 * Uses exponential backoff between attempts.
 */
declare function runWithRetry(cmd: string, args: string[], opts?: RetryOptions & RunOptions): string;

/**
 * Slack channel → workspace mapping cache.
 * Resolves which Slack workspace owns a given channel.
 *
 * @module
 */
/** Options for the Slack workspace resolver. */
interface SlackWorkspaceOptions {
    /** Path to the channel→workspace cache JSON file. */
    cachePath: string;
    /** Default workspace team ID when resolution fails. */
    defaultWorkspace: string;
}
/** Flush pending cache changes to disk. */
declare function saveCache(): void;
/**
 * Resolve the workspace team ID that owns a Slack channel.
 * Results are cached to disk.
 *
 * @param channelId - Slack channel ID.
 * @param token - Slack bot token for API calls.
 * @param options - Cache path and default workspace.
 *
 * @remarks
 * No remaining consumer: jeeves-scripts-core keeps channel-to-workspace in
 * its Slack state cache. Deprecation is planned for 0.7.1 (#127).
 */
declare function getChannelWorkspace(channelId: string, token: string, options: SlackWorkspaceOptions): Promise<string>;

/**
 * Service manager contract and shared option resolution.
 *
 * @remarks
 * Shared by the per-platform managers built in `createServiceManager`
 * and `createLinuxManager`.
 */

/** Options for service manager commands that accept a service name override. */
interface ServiceManagerOptions {
    /** Override the default service name. */
    name?: string;
    /** Override config path for install. */
    configPath?: string;
}
/** Outcome of {@link ServiceManager.install}. */
interface ServiceInstallResult {
    /**
     * True when the service was already provisioned outside core (a Linux
     * system unit) and install was a no-op.
     */
    existing: boolean;
    /** Human-readable summary of what install did. */
    message: string;
}
/** Service lifecycle manager produced by the factory. */
interface ServiceManager {
    /** Install the service with the system service manager. */
    install(options?: ServiceManagerOptions): ServiceInstallResult;
    /** Uninstall the service from the system service manager. */
    uninstall(options?: ServiceManagerOptions): void;
    /** Start the service. */
    start(options?: ServiceManagerOptions): void;
    /** Stop the service. */
    stop(options?: ServiceManagerOptions): void;
    /** Restart the service (stop + start). */
    restart(options?: ServiceManagerOptions): void;
    /** Query the service state. */
    status(options?: ServiceManagerOptions): ServiceState;
    /** Query the service status, naming the unit and scope it was read from. */
    statusDetail(options?: ServiceManagerOptions): ServiceStatus;
}

/**
 * Factory for platform-aware service lifecycle management.
 *
 * @remarks
 * Produces a `ServiceManager` that handles install, uninstall, start,
 * stop, restart, and status for system services. Delegates to NSSM
 * (Windows), systemd (Linux), or launchd (macOS) based on platform.
 * On Linux an existing system unit is detected and managed in place
 * (see `createLinuxManager`).
 */

/**
 * Create a platform-aware service manager from a component descriptor.
 *
 * @remarks
 * Detects the current platform and returns a `ServiceManager` that
 * delegates to NSSM (Windows), systemd (Linux), or launchd (macOS).
 *
 * @param descriptor - The component descriptor.
 * @returns A `ServiceManager` for the current platform.
 */
declare function createServiceManager(descriptor: JeevesComponentDescriptor): ServiceManager;

/**
 * Shared internal utility functions.
 *
 * @packageDocumentation
 */
/**
 * Extract a human-readable message from an unknown caught value.
 *
 * @param err - The caught value (typically `unknown`).
 * @returns The error message string.
 */
declare function getErrorMessage(err: unknown): string;
/**
 * Classify whether an error is a transient network failure.
 *
 * @param err - The caught value.
 * @returns `true` for ECONNRESET, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT,
 *          AbortError, and timeout-related fetch errors.
 */
declare function isTransientError(err: unknown): boolean;

export { AGENTS_MARKERS, COMPONENT_CONFIG_PREFIX, CONFIG_FILE, CONVERSATION_HOOK_NAMES, CORE_CONFIG_DIR, CORE_VERSION, DEFAULT_BIND_ADDRESS, DEFAULT_FETCH_TIMEOUT_MS, DEFAULT_PORTS, LEGACY_TOOLS_MARKERS, META_PORT, PLATFORM_COMPONENTS, RUNNER_PORT, SERVER_PORT, SOUL_MARKERS, STALE_LOCK_MS, VERSION_STAMP_PATTERN, WATCHER_PORT, WORKSPACE_CONFIG_DEFAULTS, WORKSPACE_CONFIG_FILE, WORKSPACE_FILES, analyzeMemory, appendJsonl, argFlag, argOptional, argValue, atomicWrite, buildEffectiveConfig, checkNodeVersion, connectionFail, coreConfigSchema, createConfigApplyHandler, createConfigQueryHandler, createGoogleAuth, createPluginToolset, createServiceCli, createServiceManager, createStatusHandler, ensureDir, exponentialBackoff, fail, fetchJson, fetchWithTimeout, formatBeginMarker, formatEndMarker, generateJsonSchema, generateWorkspaceJsonSchema, getArg, getBindAddress, getChannelWorkspace, getComponentConfigDir, getComponentConfigPath, getConfigRoot, getCoreConfigDir, getCoreConfigFile, getEffectiveServiceName, getErrorMessage, getPackageRoot, getPackageVersion, getServiceState, getServiceUrl, getWorkspacePath, init, isTransientError, jeevesComponentDescriptorSchema, loadEnvFile, loadWorkspaceConfig, nowIso, ok, onPluginDispose, parseArgs, parseManaged, parseRunnableArgs, pluginToolsetOptionsSchema, positionalArgs, postJson, promptContextOptionsSchema, readJson, readJsonl, recordRegisteredHooks, registerComponentConfigPath, registerPromptContext, rejectWindowsDrivePath, removeManagedBlock, renderManagedBlock, resetInit, resolveConfigValue, resolveOptionalPluginSetting, resolvePluginSetting, resolveWorkspacePath, retryAsync, retrySync, run, runScript, runWithRetry, saveCache, sleepAsync, sleepMs, substituteEnvVars, upsertManagedBlock, uuid, validateConversationHooks, validateSkillFrontmatter, withFileLock, workspaceConfigSchema, writeJsonAtomic, writeJsonl };
export type { AccountConfig, ArgSpec, ArgValueOptions, ConfigApplyHandler, ConfigApplyRequest, ConfigApplyResult, ConfigProvenance, ConfigQueryHandler, ConfigQueryResponse, CoreConfig, CreateStatusHandlerOptions, FetchJsonOptions, FlagSpec, GoogleAuthOptions, HookRegistrationOptions, InitOptions, JeevesComponentDescriptor, ManagedBlockStampOptions, ManagedMarkers, MemoryHygieneOptions, MemoryHygieneResult, OptionalSpec, ParseManagedResult, ParsedArgs, PlatformComponent, PluginApi, PluginApiUrlResolver, PluginLifecycleApi, PluginToolsetOptions, PromptBuildContext, PromptBuildEvent, PromptBuildHandler, PromptBuildResult, PromptContextOptions, PromptContextProvider, ResolvedCliConfig, ResolvedValue, RetryOptions, RetryPolicy, RunOptions, ServiceAccountFileConfig, ServiceInstallResult, ServiceManager, ServiceManagerOptions, ServiceScope, ServiceState, ServiceStatus, SkillFrontmatter, SlackWorkspaceOptions, StatusHandler, StatusHandlerResult, StatusResponse, ToolDescriptor, ToolRegistrationOptions, ToolResult, ValueSpec, VersionStamp, WorkspaceConfig, WorkspaceOptions };
