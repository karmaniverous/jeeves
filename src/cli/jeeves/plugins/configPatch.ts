/**
 * Pure computation of the OpenClaw config changes the jeeves CLI makes around
 * plugin install/uninstall. No I/O.
 *
 * @remarks
 * - Hook access: `plugins.entries.<id>.hooks.allowConversationAccess: true`
 *   is required for conversation hooks such as `before_prompt_build`, and
 *   `--accept-capabilities` does not set it (runbook spike S2). Only granted
 *   to plugins that declare such hooks (see `conversationHooks.ts`); never
 *   removed. Written as a leaf path, so sibling keys such as
 *   `plugins.entries.<id>.config` are preserved.
 * - Post-uninstall repair: `openclaw plugins uninstall` leaves
 *   `entries.<id> = { enabled: false }` behind and can delete `plugins.load`
 *   (spike S1). Both are undone.
 *
 * @module
 */

import { z } from 'zod';

import { isRecord } from '../../../utils.js';
import type { ConfigSetOperation } from './openclawCommands.js';

/** The slice of `openclaw.json` → `plugins` this CLI reads. */
export const pluginsConfigSchema = z.looseObject({
  entries: z.record(z.string(), z.unknown()).optional(),
  load: z.unknown().optional(),
});

/** Parsed `plugins` config slice. */
export type PluginsConfig = z.infer<typeof pluginsConfigSchema>;

const entrySchema = z.looseObject({
  enabled: z.boolean().optional(),
  hooks: z.looseObject({ allowConversationAccess: z.unknown() }).optional(),
});

/** Config path of a plugin entry. */
export const entryPath = (pluginId: string): string =>
  `plugins.entries.${pluginId}`;

/** Config path of a plugin's conversation-access hook gate. */
const hookAccessPath = (pluginId: string): string =>
  `${entryPath(pluginId)}.hooks.allowConversationAccess`;

/** Config path of one key of a plugin's own config. */
export const configValuePath = (pluginId: string, key: string): string =>
  `${entryPath(pluginId)}.config.${key}`;

/**
 * Operations that grant conversation-access hooks to the given plugins.
 *
 * @param plugins - Current `plugins` config.
 * @param pluginIds - Plugins that register conversation hooks.
 * @returns One operation per plugin not already granted (may be empty).
 */
export function computeHookAccessOps(
  plugins: PluginsConfig,
  pluginIds: readonly string[],
): ConfigSetOperation[] {
  return pluginIds
    .filter((id) => {
      const entry = entrySchema.safeParse(plugins.entries?.[id]);
      return !(
        entry.success && entry.data.hooks?.allowConversationAccess === true
      );
    })
    .map((id) => ({ path: hookAccessPath(id), value: true }));
}

/**
 * Whether an entry is the `{ enabled: false }` husk left by uninstall.
 *
 * @param entry - A `plugins.entries.<id>` value.
 * @returns `true` only for an object whose sole key is `enabled: false`.
 */
export function isLeftoverDisabledEntry(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const keys = Object.keys(entry);
  return (
    keys.length === 1 && keys[0] === 'enabled' && entry['enabled'] === false
  );
}

/**
 * Operation restoring a `plugins.load` value that uninstall deleted.
 *
 * @param load - The value captured before uninstall.
 * @returns The `config set` operation.
 */
export const restoreLoadOp = (load: unknown): ConfigSetOperation => ({
  path: 'plugins.load',
  value: load,
});

/** Config repair to apply after `openclaw plugins uninstall`. */
export interface PostUninstallRepair {
  /** Paths to `openclaw config unset`. */
  unsetPaths: string[];
  /** Operations for `openclaw config set --batch-file` (may be empty). */
  setOps: ConfigSetOperation[];
}

/**
 * Compute the repair for the S1 uninstall quirks.
 *
 * @param before - `plugins` config captured before uninstall.
 * @param after - `plugins` config read after uninstall.
 * @param pluginIds - Plugins that were uninstalled.
 * @returns Unset paths and set operations.
 */
export function computePostUninstallRepair(
  before: PluginsConfig,
  after: PluginsConfig,
  pluginIds: readonly string[],
): PostUninstallRepair {
  const unsetPaths = pluginIds
    .filter((id) => isLeftoverDisabledEntry(after.entries?.[id]))
    .map(entryPath);
  const setOps: ConfigSetOperation[] =
    before.load !== undefined && after.load === undefined
      ? [restoreLoadOp(before.load)]
      : [];
  return { unsetPaths, setOps };
}

/**
 * Jeeves plugin ids that have an entry in the config.
 *
 * @param plugins - Current `plugins` config.
 * @param isJeeves - Jeeves id predicate.
 * @returns Matching ids, sorted.
 */
export function configuredPluginIds(
  plugins: PluginsConfig,
  isJeeves: (id: string) => boolean,
): string[] {
  return Object.keys(plugins.entries ?? {})
    .filter(isJeeves)
    .sort();
}
