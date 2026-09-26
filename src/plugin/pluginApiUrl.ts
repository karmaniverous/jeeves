/**
 * Service base URL resolution for plugin tools.
 *
 * @remarks
 * Plugin tools must call the service at the plugin's configured `apiUrl`
 * (`plugins.entries.<id>.config.apiUrl`). The descriptor's `defaultPort`
 * is only the fallback when no `apiUrl` is set.
 */

import { z } from 'zod';

/**
 * Lazy `apiUrl` resolver, evaluated on every tool call (so a plugin can
 * read its config at call time, like `configRoot`).
 */
export type PluginApiUrlResolver = () => string | undefined;

/** Options for {@link createPluginToolset}. */
export const pluginToolsetOptionsSchema = z.object({
  /**
   * Service base URL (e.g. `http://127.0.0.1:1936`), or a resolver
   * evaluated per tool call. Unset, empty, or a resolver returning
   * `undefined` falls back to `http://127.0.0.1:<defaultPort>`.
   */
  apiUrl: z
    .union([
      z.string(),
      z.custom<PluginApiUrlResolver>((v) => typeof v === 'function', {
        message: 'apiUrl must be a string or a function',
      }),
    ])
    .optional(),
});

/** Options for {@link createPluginToolset}. */
export type PluginToolsetOptions = z.infer<typeof pluginToolsetOptionsSchema>;

/**
 * Resolve the service base URL for a plugin tool call.
 *
 * @param apiUrl - Configured URL or lazy resolver (optional).
 * @param defaultPort - Descriptor default port, used when `apiUrl` is unset.
 * @returns Base URL without a trailing slash.
 */
export function resolvePluginApiUrl(
  apiUrl: PluginToolsetOptions['apiUrl'],
  defaultPort: number,
): string {
  const value = (typeof apiUrl === 'function' ? apiUrl() : apiUrl)?.trim();
  const url = value ? value : `http://127.0.0.1:${String(defaultPort)}`;
  return url.replace(/\/+$/, '');
}
