/**
 * Installed Jeeves plugins as OpenClaw records them, for idempotent installs.
 *
 * @remarks
 * Read with `openclaw plugins inspect --all --json` (v2026.9.6
 * `src/cli/plugins-inspect-command.ts`): a JSON array of
 * `PluginInspectReport` objects plus `install`, the install record from
 * OpenClaw's state DB (`src/config/zod-schema.installs.ts`). Without
 * `--runtime` this loads no plugin code. One call covers every plugin.
 *
 * A plugin counts as already installed at a version only when all of these
 * hold, so anything unusual falls back to a reinstall:
 * - the record's `source` is `npm` (a v0.x path install is always replaced);
 * - the record names the package (`resolvedName`, else the name in
 *   `resolvedSpec`/`spec`);
 * - the recorded version (`resolvedVersion`, else `version`) is the target;
 * - the loaded plugin's own version, when reported, is the target.
 *
 * @module
 */

import { z } from 'zod';

import { getErrorMessage } from '../../../utils.js';
import {
  type CommandRunner,
  describeExit,
  formatCommand,
} from './commandRunner.js';
import { OPENCLAW_BIN, pluginsInspectAllArgs } from './openclawCommands.js';

const inspectEntrySchema = z.looseObject({
  plugin: z.looseObject({
    id: z.string(),
    version: z.string().optional(),
  }),
  install: z
    .looseObject({
      source: z.string(),
      spec: z.string().optional(),
      version: z.string().optional(),
      resolvedName: z.string().optional(),
      resolvedVersion: z.string().optional(),
      resolvedSpec: z.string().optional(),
    })
    .optional(),
});

/** One inspect report (only the fields used here). */
export type PluginInspectEntry = z.infer<typeof inspectEntrySchema>;

/** Installed plugins by id, or why they could not be read. */
export type InstalledPlugins =
  | { ok: true; byId: ReadonlyMap<string, PluginInspectEntry> }
  | { ok: false; reason: string };

/** Package name from an npm spec such as `npm:@scope/pkg@1.2.3`. */
function specName(spec: string | undefined): string | undefined {
  if (!spec) return undefined;
  const bare = spec.startsWith('npm:') ? spec.slice(4) : spec;
  const at = bare.lastIndexOf('@');
  return at > 0 ? bare.slice(0, at) : bare;
}

/**
 * Whether a plugin is already installed from npm at exactly `version`.
 *
 * @param entry - Inspect report of the plugin (undefined: not installed).
 * @param packageName - Expected npm package.
 * @param version - Target exact version.
 * @returns `true` only when every check in the module remarks passes.
 */
export function isInstalledAt(
  entry: PluginInspectEntry | undefined,
  packageName: string,
  version: string,
): boolean {
  const install = entry?.install;
  if (!entry || install?.source !== 'npm') return false;
  const name =
    install.resolvedName ?? specName(install.resolvedSpec ?? install.spec);
  const recorded = install.resolvedVersion ?? install.version;
  return (
    name === packageName &&
    recorded === version &&
    (entry.plugin.version === undefined || entry.plugin.version === version)
  );
}

/** Parse inspect output; tolerates log lines before the JSON array. */
function parseInspectOutput(stdout: string): unknown {
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('\n[');
    if (start < 0) throw new Error('no JSON array in output');
    return JSON.parse(text.slice(start + 1));
  }
}

/**
 * Read installed plugins via `openclaw plugins inspect --all --json`.
 *
 * @param runner - Command runner.
 * @returns Reports by plugin id, or a reason when they cannot be read (the
 *   caller then reinstalls everything).
 */
export async function readInstalledPlugins(
  runner: CommandRunner,
): Promise<InstalledPlugins> {
  const args = pluginsInspectAllArgs();
  const result = await runner(OPENCLAW_BIN, args);
  if (result.exitCode !== 0) {
    return {
      ok: false,
      reason: describeExit(OPENCLAW_BIN, args, result.exitCode),
    };
  }
  try {
    const entries = z
      .array(z.unknown())
      .parse(parseInspectOutput(result.stdout))
      .flatMap((raw) => {
        const parsed = inspectEntrySchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      });
    return {
      ok: true,
      byId: new Map(entries.map((e) => [e.plugin.id, e] as const)),
    };
  } catch (error) {
    return {
      ok: false,
      reason: `unexpected output from ${formatCommand(OPENCLAW_BIN, args)}: ${getErrorMessage(error)}`,
    };
  }
}
