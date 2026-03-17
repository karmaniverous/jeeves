/**
 * Shared CLI defaults and option registration for Jeeves CLI commands.
 *
 * @remarks
 * All three CLI commands (install, uninstall, status) share the same
 * `--workspace` and `--config-root` options with the same defaults.
 * This module centralizes them to eliminate duplication.
 */

import { init } from '../../init.js';

/** Default workspace path (current directory). */
export const DEFAULT_WORKSPACE = '.';

/** Default config root path. */
export const DEFAULT_CONFIG_ROOT = './config';

/** Standard workspace options parsed from CLI. */
export interface WorkspaceOptions {
  /** Workspace root path. */
  workspace: string;
  /** Platform config root path. */
  configRoot: string;
}

/**
 * Initialize core from standard CLI options.
 *
 * @param opts - Parsed Commander options with workspace and configRoot.
 */
export function initFromOptions(opts: WorkspaceOptions): void {
  init({ workspacePath: opts.workspace, configRoot: opts.configRoot });
}
