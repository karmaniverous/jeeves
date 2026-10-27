/**
 * Resolve the bootstrap limits OpenClaw applies to a workspace, for the
 * `jeeves install` size report (#120).
 *
 * @remarks
 * OpenClaw reads `agents.defaults.bootstrapMaxChars` and
 * `agents.defaults.bootstrapTotalMaxChars`, and each agent may override
 * them with `agents.entries.<id>.bootstrapMaxChars` /
 * `bootstrapTotalMaxChars` (omitted values inherit the defaults). The
 * agents that load a workspace are the entries whose `workspace` resolves
 * to it; entries without a `workspace` use an agent-id subdirectory, so
 * they never own it. When several entries share the workspace, the
 * smallest effective limit wins, since that agent truncates first. When
 * none does, the defaults apply.
 *
 * @module
 */

import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import type { CommandRunner } from '../plugins/commandRunner.js';
import { configGetArgs, OPENCLAW_BIN } from '../plugins/openclawCommands.js';
import {
  BOOTSTRAP_TOTAL_MAX_CHARS,
  type BootstrapLimits,
  type BootstrapLimitSource,
  defaultBootstrapLimits,
} from './bootstrapReport.js';
import { BOOTSTRAP_FILE_MAX_CHARS } from './budgets.js';

const limit = z.number().int().positive().optional().catch(undefined);

const limitsSchema = z.looseObject({
  bootstrapMaxChars: limit,
  bootstrapTotalMaxChars: limit,
});

const agentsSchema = z.looseObject({
  defaults: limitsSchema.optional().catch(undefined),
  entries: z
    .record(
      z.string(),
      limitsSchema.extend({
        workspace: z.string().optional().catch(undefined),
      }),
    )
    .optional()
    .catch(undefined),
});

/** The parsed `agents` config slice (`{}` when unset or unreadable). */
export type AgentsLimitsConfig = z.infer<typeof agentsSchema>;

/** Expand `~`, resolve, and normalise a path for comparison. */
function canonical(p: string, home: string): string {
  const expanded =
    p === '~' || /^~[/\\]/.test(p) ? path.join(home, p.slice(1)) : p;
  const resolved = path.resolve(expanded).replace(/[/\\]+$/, '');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * The effective limits for one workspace (pure).
 *
 * @param agents - The `agents` config slice.
 * @param workspacePath - The workspace being measured.
 * @param home - Home directory, for `~` (default `os.homedir()`).
 * @returns The limits; a limit's source is `unset` when any owning agent
 *   falls back to the built-in default, else `config`.
 */
export function resolveBootstrapLimits(
  agents: AgentsLimitsConfig,
  workspacePath: string,
  home: string = os.homedir(),
): BootstrapLimits {
  const defaults = agents.defaults ?? {};
  const target = canonical(workspacePath, home);
  const owners: Array<z.infer<typeof limitsSchema>> = Object.values(
    agents.entries ?? {},
  ).filter(
    (e) => e.workspace !== undefined && canonical(e.workspace, home) === target,
  );
  const candidates = owners.length > 0 ? owners : [{}];

  const pick = (
    key: 'bootstrapMaxChars' | 'bootstrapTotalMaxChars',
    builtIn: number,
  ): [number, BootstrapLimitSource] => {
    const values = candidates.map((entry) => entry[key] ?? defaults[key]);
    return [
      Math.min(...values.map((v) => v ?? builtIn)),
      values.includes(undefined) ? 'unset' : 'config',
    ];
  };
  const [perFile, perFileSource] = pick(
    'bootstrapMaxChars',
    BOOTSTRAP_FILE_MAX_CHARS,
  );
  const [total, totalSource] = pick(
    'bootstrapTotalMaxChars',
    BOOTSTRAP_TOTAL_MAX_CHARS,
  );
  return {
    perFile,
    total,
    source: { perFile: perFileSource, total: totalSource },
  };
}

/**
 * Read OpenClaw's `agents` config and resolve the workspace's limits.
 * Never throws: an unreadable slice gives the defaults with source
 * `failed`; an unset limit gives its default with source `unset`.
 *
 * @param runner - Command runner.
 * @param workspacePath - The workspace being measured.
 * @returns The limits and their sources.
 */
export async function readBootstrapLimits(
  runner: CommandRunner,
  workspacePath: string,
): Promise<BootstrapLimits> {
  try {
    const result = await runner(OPENCLAW_BIN, configGetArgs('agents'));
    if (result.exitCode !== 0) return defaultBootstrapLimits('failed');
    const agents = agentsSchema
      .catch({})
      .parse(JSON.parse(result.stdout) as unknown);
    return resolveBootstrapLimits(agents, workspacePath);
  } catch {
    return defaultBootstrapLimits('failed');
  }
}
