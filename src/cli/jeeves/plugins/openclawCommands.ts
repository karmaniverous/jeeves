/**
 * Pure builders for every `openclaw` / `npm` argument vector the jeeves CLI
 * runs. No I/O.
 *
 * @remarks
 * Flags verified against OpenClaw v2026.9.6 (`src/cli/plugins-cli.ts`,
 * `src/cli/config-cli.ts`):
 * - `plugins install`: `--pin` records the exact resolved npm version;
 *   `--accept-capabilities` records consent; `--force` is REQUIRED for any
 *   non-ClawHub source (runbook spike S1) and also overwrites an existing
 *   install, which is how updates are applied.
 * - `plugins uninstall --force` skips the interactive confirmation.
 * - `config set --batch-json` applies several path writes atomically.
 *
 * Nothing here ever targets `plugins.installs` (OpenClaw keeps install
 * records in its state DB; the key is retired).
 *
 * @module
 */

/** OpenClaw CLI executable. */
export const OPENCLAW_BIN = 'openclaw';

/** npm CLI executable. */
export const NPM_BIN = 'npm';

/** One `openclaw config set --batch-json` operation. */
export interface ConfigSetOperation {
  /** Dot path. */
  path: string;
  /** JSON value. */
  value: unknown;
}

/** Retired config key that must never be written. */
const RETIRED_INSTALLS_PATH = /^plugins\.installs(?:\.|$)/;

/**
 * Throw if a config path targets the retired `plugins.installs` key.
 *
 * @param path - Config dot path.
 */
export function assertWritablePath(path: string): void {
  if (RETIRED_INSTALLS_PATH.test(path)) {
    throw new Error(`Refusing to write retired config key: ${path}`);
  }
}

/** `openclaw --version` (prerequisite probe). */
export const openclawVersionArgs = (): string[] => ['--version'];

/**
 * `openclaw plugins install npm:<pkg>@<version> --pin --accept-capabilities --force`.
 *
 * @param packageName - Scoped npm package name.
 * @param version - Exact version.
 * @returns Argument vector.
 */
export const pluginInstallArgs = (
  packageName: string,
  version: string,
): string[] => [
  'plugins',
  'install',
  `npm:${packageName}@${version}`,
  '--pin',
  '--accept-capabilities',
  '--force',
];

/**
 * `openclaw plugins uninstall <id> --force`.
 *
 * @param pluginId - OpenClaw plugin id.
 * @returns Argument vector.
 */
export const pluginUninstallArgs = (pluginId: string): string[] => [
  'plugins',
  'uninstall',
  pluginId,
  '--force',
];

/**
 * `openclaw config get <path> --json` (read-only).
 *
 * @param path - Config dot path.
 * @returns Argument vector.
 */
export const configGetArgs = (path: string): string[] => [
  'config',
  'get',
  path,
  '--json',
];

/**
 * `openclaw config set --batch-json '<ops>'`.
 *
 * @param ops - Operations (non-empty).
 * @returns Argument vector.
 */
export function configSetBatchArgs(
  ops: readonly ConfigSetOperation[],
): string[] {
  if (ops.length === 0) throw new Error('config set batch must not be empty');
  for (const op of ops) assertWritablePath(op.path);
  return ['config', 'set', '--batch-json', JSON.stringify(ops)];
}

/**
 * `openclaw config unset <path>`.
 *
 * @param path - Config dot path.
 * @returns Argument vector.
 */
export function configUnsetArgs(path: string): string[] {
  assertWritablePath(path);
  return ['config', 'unset', path];
}

/**
 * `npm view <pkg>@<range> version --json` (read-only version resolution).
 *
 * @param packageName - Scoped npm package name.
 * @param range - Version, range, or dist-tag.
 * @returns Argument vector.
 */
export const npmViewVersionArgs = (
  packageName: string,
  range: string,
): string[] => ['view', `${packageName}@${range}`, 'version', '--json'];
