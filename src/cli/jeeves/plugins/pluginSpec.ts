/**
 * Parse Jeeves plugin package specs (`watcher`, `watcher@1.2.3`,
 * `@karmaniverous/jeeves-watcher-openclaw@^1`) into install targets. Pure.
 *
 * @remarks
 * Only Jeeves OpenClaw plugin packages (`@karmaniverous/jeeves-*-openclaw`)
 * are accepted; anything else is rejected rather than handed to
 * `openclaw plugins install`. The OpenClaw plugin id is the unscoped package
 * name (matches every published Jeeves plugin manifest).
 *
 * @module
 */

import { z } from 'zod';

import { PLATFORM_COMPONENTS } from '../../../constants/index.js';

/** npm scope of Jeeves packages. */
export const JEEVES_SCOPE = '@karmaniverous';

/** Unscoped Jeeves plugin package name / OpenClaw plugin id (regex source). */
const PLUGIN_ID_SOURCE = 'jeeves(?:-[a-z0-9]+)*-openclaw';

/** Unscoped Jeeves plugin package name / OpenClaw plugin id. */
const PLUGIN_ID_PATTERN = new RegExp(`^${PLUGIN_ID_SOURCE}$`);

/** Short component name (`watcher`, `runner`, …). */
const SHORT_NAME_PATTERN = /^[a-z][a-z0-9]*$/;

/** A resolved-or-unresolved Jeeves plugin install target. */
export const pluginTargetSchema = z.object({
  /** Scoped npm package name. */
  packageName: z
    .string()
    .regex(new RegExp(`^${JEEVES_SCOPE}/${PLUGIN_ID_SOURCE}$`)),
  /** OpenClaw plugin id (unscoped package name). */
  pluginId: z.string().regex(PLUGIN_ID_PATTERN),
  /** npm version, range, or dist-tag (default `latest`). */
  range: z.string().min(1),
});

/** A Jeeves plugin install target. */
export type PluginTarget = z.infer<typeof pluginTargetSchema>;

/**
 * OpenClaw plugin id of a platform component's plugin.
 *
 * @param component - Component short name, e.g. `watcher`.
 * @returns e.g. `jeeves-watcher-openclaw`.
 */
export const pluginIdOf = (component: string): string =>
  `jeeves-${component}-openclaw`;

/**
 * Scoped npm package name of a Jeeves plugin.
 *
 * @param pluginId - OpenClaw plugin id (the unscoped package name).
 * @returns e.g. `@karmaniverous/jeeves-watcher-openclaw`.
 */
export const packageNameOf = (pluginId: string): string =>
  `${JEEVES_SCOPE}/${pluginId}`;

/**
 * Whether an OpenClaw plugin id belongs to a Jeeves plugin.
 *
 * @param id - OpenClaw plugin id.
 * @returns `true` for `jeeves-*-openclaw` ids.
 */
export function isJeevesPluginId(id: string): boolean {
  return PLUGIN_ID_PATTERN.test(id);
}

/** Split `name@range` (the scope's leading `@` is not a separator). */
function splitRange(spec: string): [string, string | undefined] {
  const at = spec.lastIndexOf('@');
  if (at <= 0) return [spec, undefined];
  return [spec.slice(0, at), spec.slice(at + 1)];
}

/** Map a name form to the unscoped plugin id. */
function toPluginId(name: string): string | undefined {
  if (name.startsWith(`${JEEVES_SCOPE}/`)) {
    return name.slice(JEEVES_SCOPE.length + 1);
  }
  if (name.startsWith('@')) return undefined;
  if (PLUGIN_ID_PATTERN.test(name)) return name;
  if (SHORT_NAME_PATTERN.test(name) && name !== 'openclaw') {
    return pluginIdOf(name);
  }
  return undefined;
}

/**
 * Parse one user-supplied plugin spec.
 *
 * @param input - `watcher`, `watcher@1.2.3`, `jeeves-watcher-openclaw`, or
 *   `@karmaniverous/jeeves-watcher-openclaw@^1`.
 * @returns The install target.
 * @throws Error when the spec is not a Jeeves OpenClaw plugin package.
 */
export function parsePluginSpec(input: string): PluginTarget {
  const [name, range] = splitRange(input.trim());
  const pluginId = toPluginId(name);
  const parsed = pluginTargetSchema.safeParse({
    packageName: packageNameOf(pluginId ?? ''),
    pluginId,
    range: range ?? 'latest',
  });
  if (!pluginId || !parsed.success) {
    throw new Error(
      `Not a Jeeves OpenClaw plugin package: "${input}". Expected e.g. "watcher", "watcher@1.2.3" or "${JEEVES_SCOPE}/jeeves-watcher-openclaw@^1".`,
    );
  }
  return parsed.data;
}

/**
 * Parse a list of specs, rejecting duplicates of the same plugin.
 *
 * @param inputs - User-supplied specs.
 * @returns Install targets in input order.
 */
export function parsePluginSpecs(inputs: readonly string[]): PluginTarget[] {
  const targets = inputs.map(parsePluginSpec);
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.pluginId)) {
      throw new Error(`Plugin "${t.pluginId}" was specified more than once.`);
    }
    seen.add(t.pluginId);
  }
  return targets;
}

/**
 * Default install targets: the plugin of every platform component, `latest`.
 *
 * @returns One target per {@link PLATFORM_COMPONENTS} entry.
 */
export function defaultPluginTargets(): PluginTarget[] {
  return PLATFORM_COMPONENTS.map((name) => parsePluginSpec(name));
}
