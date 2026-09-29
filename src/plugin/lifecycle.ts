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

import type { PluginApi } from './types.js';

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
export function onPluginDispose(
  api: PluginApi,
  id: string,
  dispose: () => void | Promise<void>,
): boolean {
  const lifecycle = api.lifecycle;
  if (typeof lifecycle?.onDispose === 'function') {
    lifecycle.onDispose(dispose);
    return true;
  }
  if (typeof lifecycle?.registerRuntimeLifecycle === 'function') {
    lifecycle.registerRuntimeLifecycle({ id, dispose });
    return true;
  }
  return false;
}
