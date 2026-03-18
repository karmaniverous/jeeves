/**
 * Resolve the OpenClaw workspace root from the plugin API.
 *
 * @remarks
 * Tries three sources in order:
 * 1. `api.resolvePath('.')` — the gateway-provided resolver (most authoritative)
 * 2. `api.config.agents.defaults.workspace` — the OpenClaw config value
 * 3. `process.cwd()` — last resort (unsafe when gateway runs from system32)
 *
 * Plugins should call this once at registration time and pass the result
 * to `init({ workspacePath })`.
 */

/**
 * Minimal shape of the OpenClaw plugin API needed for workspace resolution.
 *
 * @remarks
 * Intentionally loose — plugins define their own full `PluginApi` type.
 * This captures only the fields `resolveWorkspacePath` inspects.
 */
export interface PluginApiLike {
  /** Gateway-provided path resolver. May not exist in all gateway versions. */
  resolvePath?: (input: string) => string;
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
  };
}

/**
 * Resolve the workspace root from the OpenClaw plugin API.
 *
 * @param api - The plugin API object provided by the gateway at registration.
 * @returns Absolute path to the workspace root.
 */
export function resolveWorkspacePath(api: PluginApiLike): string {
  // 1. Gateway-provided resolver (most authoritative)
  if (typeof api.resolvePath === 'function') {
    return api.resolvePath('.');
  }

  // 2. OpenClaw config value
  const configured = api.config?.agents?.defaults?.workspace;
  if (typeof configured === 'string' && configured.trim()) {
    return configured;
  }

  // 3. Last resort — unsafe when gateway runs from system32
  return process.cwd();
}
