/**
 * Service base URL resolution for plugin tools.
 *
 * @remarks
 * Plugin tools must call the service at the plugin's configured `apiUrl`
 * (`plugins.entries.<id>.config.apiUrl`). The descriptor's `defaultPort`
 * is only the fallback when no `apiUrl` is set.
 */

import { z } from 'zod';

import type { ClientAuth } from '../catalog/clientAuth.js';
import type { Catalog } from '../catalog/types.js';
import type { PluginApi } from './types.js';

/** How one catalog entry is exposed as a plugin tool (the `tools` values). */
const catalogToolSelectionSchema = z.object({
  /** Description override; default the entry's. */
  description: z.string().optional(),
  /** Tool parameter names for entry fields, keyed by entry field. */
  inputAliases: z.record(z.string(), z.string()).optional(),
  /** `'direct-only'`: always model-visible, even under Tool Search. */
  catalogMode: z.literal('direct-only').optional(),
});

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
  /** Endpoint catalog: enables `tools` and supplies the standard entries. */
  catalog: z
    .custom<Catalog>(
      (v) =>
        typeof v === 'object' &&
        v !== null &&
        Array.isArray((v as Catalog).entries),
      { message: 'catalog must come from defineCatalog' },
    )
    .optional(),
  /** Catalog entries to expose as tools, keyed by entry name. */
  tools: z
    .record(z.string(), z.union([z.literal(true), catalogToolSelectionSchema]))
    .optional(),
  /** Credential for catalog-built tools. */
  auth: z
    .custom<ClientAuth>((v) => typeof v === 'object' && v !== null, {
      message: 'auth must be a ClientAuth object',
    })
    .optional(),
  /** Plugin API, passed to the descriptor's `customPluginTools`. */
  api: z
    .custom<PluginApi>((v) => typeof v === 'object' && v !== null, {
      message: 'api must be the plugin API object',
    })
    .optional(),
});

/** How one catalog entry is exposed as a plugin tool. */
export type CatalogToolSelection = z.infer<typeof catalogToolSelectionSchema>;

/** Options for {@link createPluginToolset}. */
export interface PluginToolsetOptions<C extends Catalog = Catalog> {
  /**
   * Service base URL (e.g. `http://127.0.0.1:1936`), or a resolver
   * evaluated per tool call. Unset, empty, or a resolver returning
   * `undefined` falls back to `http://127.0.0.1:<defaultPort>`.
   */
  apiUrl?: string | PluginApiUrlResolver;
  /**
   * The component's endpoint catalog. Enables `tools`; its `status`,
   * `config` and `configApply` entries (with their real `auth`) back the
   * standard tools.
   */
  catalog?: C;
  /**
   * Catalog entries to expose as tools (`true` or settings), keyed by entry
   * name; unselected entries get no tool. Requires `catalog`.
   */
  tools?: Partial<
    Record<C['entries'][number]['name'], true | CatalogToolSelection>
  >;
  /**
   * Credential for catalog-built tools and, when `catalog` is passed, the
   * standard tools; attached only to entries whose `auth` lists a matching
   * scheme. Without it no credentials are sent, as in 0.7.0.
   */
  auth?: ClientAuth;
  /**
   * Plugin API: when set, the descriptor's `customPluginTools(api)` result
   * is appended (#141).
   */
  api?: PluginApi;
}

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
