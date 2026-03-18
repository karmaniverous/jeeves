/**
 * Resolve the OpenClaw workspace root from the plugin API.
 *
 * @remarks
 * Tries three sources in order:
 * 1. `api.config.agents.defaults.workspace` — explicit config (most authoritative)
 * 2. `api.resolvePath('.')` — gateway-provided path resolver
 * 3. `process.cwd()` — last resort (unsafe when gateway runs from system32)
 *
 * The config value is checked first because `api.resolvePath('.')` delegates
 * to `path.resolve('.')`, which returns `process.cwd()` — not the workspace.
 * When the gateway runs as a Windows service from `C:\Windows\system32`,
 * `resolvePath('.')` returns system32, not the configured workspace.
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
  // 1. Explicit config value (most authoritative)
  const configured = api.config?.agents?.defaults?.workspace;
  if (typeof configured === 'string' && configured.trim()) {
    return configured;
  }

  // 2. Gateway-provided path resolver
  if (typeof api.resolvePath === 'function') {
    return api.resolvePath('.');
  }

  // 3. Last resort — unsafe when gateway runs from system32
  return process.cwd();
}
