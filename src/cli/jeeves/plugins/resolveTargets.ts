/**
 * Resolve install targets: exact version, legacy copy, whether the exact
 * version is already installed, and the conversation hooks it declares.
 * Read-only (also runs under `--dry-run`).
 *
 * @remarks
 * - Version: `npm view <pkg>@<range> version --json`.
 * - Already installed: one `openclaw plugins inspect --all --json` for all
 *   targets (see `installedPlugins.ts`). Skipped with `--force-reinstall`. A
 *   plugin with a legacy `extensions/<id>` copy is never treated as installed.
 *   If the records cannot be read, every target is reinstalled.
 * - Conversation hooks: `npm view <pkg>@<version> jeeves.conversationHooks`
 *   (see `conversationHooks.ts`).
 *
 * @module
 */

import type { CommandRunner } from './commandRunner.js';
import { readDeclaredConversationHooks } from './conversationHooks.js';
import { isInstalledAt, readInstalledPlugins } from './installedPlugins.js';
import { findLegacyExtension, type LegacyFs } from './legacyExtensions.js';
import { resolveExactVersion } from './openclawState.js';
import type { ResolvedTarget } from './plan.js';
import type { PluginTarget } from './pluginSpec.js';

/** Ports used by {@link resolveTargets}. */
export interface TargetResolutionDeps {
  /** Command runner port. */
  runner: CommandRunner;
  /** Filesystem port (legacy copies). */
  fs: LegacyFs;
  /** OpenClaw config directory. */
  configDir: string;
  /** Line logger. */
  log: (line: string) => void;
}

/** Options of {@link resolveTargets}. */
export interface ResolveTargetsOptions {
  /** Reinstall even when the exact version is already installed. */
  forceReinstall?: boolean;
}

/** Log suffix describing what will happen to a target. */
function notes(t: ResolvedTarget): string {
  const parts = [
    t.installed ? 'already installed; install skipped' : undefined,
    t.legacyDir ? 'legacy copy found' : undefined,
    t.conversationHooks.length > 0
      ? `conversation hooks: ${t.conversationHooks.join(', ')}`
      : undefined,
  ].filter((p) => p !== undefined);
  return parts.length > 0 ? ` (${parts.join('; ')})` : '';
}

/**
 * Resolve targets for an install plan.
 *
 * @param deps - Ports.
 * @param targets - Requested targets (version ranges).
 * @param options - Resolution options.
 * @returns Resolved targets, in input order.
 */
export async function resolveTargets(
  deps: TargetResolutionDeps,
  targets: readonly PluginTarget[],
  options: ResolveTargetsOptions = {},
): Promise<ResolvedTarget[]> {
  const installed =
    options.forceReinstall === true
      ? undefined
      : await readInstalledPlugins(deps.runner);
  if (installed && !installed.ok) {
    deps.log(
      `  warning: cannot read installed plugins (${installed.reason}); reinstalling every target`,
    );
  }
  const resolved: ResolvedTarget[] = [];
  for (const t of targets) {
    const version = await resolveExactVersion(
      deps.runner,
      t.packageName,
      t.range,
    );
    const legacyDir = findLegacyExtension(
      deps.fs,
      deps.configDir,
      t.pluginId,
      t.packageName,
    );
    const already =
      installed?.ok === true &&
      legacyDir === undefined &&
      isInstalledAt(installed.byId.get(t.pluginId), t.packageName, version);
    const target: ResolvedTarget = {
      ...t,
      version,
      ...(legacyDir ? { legacyDir } : {}),
      ...(already ? { installed: true } : {}),
      conversationHooks: await readDeclaredConversationHooks(
        deps.runner,
        t.packageName,
        version,
      ),
    };
    resolved.push(target);
    deps.log(`  ${t.packageName}@${version}${notes(target)}`);
  }
  return resolved;
}
