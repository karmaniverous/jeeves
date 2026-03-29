/**
 * Dynamic discovery of installed Jeeves component CLIs.
 *
 * @remarks
 * Scans for globally-installed `@karmaniverous/jeeves-*` packages
 * (excluding `-openclaw` plugins) and registers proxy subcommands
 * on the parent CLI. Each discovered component gets a `jeeves {name}`
 * command that spawns `jeeves-{name}` with passthrough args.
 */

import { execSync, spawnSync } from 'node:child_process';

import type { Command } from '@commander-js/extra-typings';

/**
 * Discover globally-installed jeeves component packages.
 *
 * @remarks
 * Runs `npm ls -g --json` and filters for packages matching
 * `@karmaniverous/jeeves-*` (excluding `-openclaw` plugins).
 * Returns short component names (e.g., 'watcher', 'runner').
 *
 * @returns Array of discovered component names.
 */
export function discoverComponentPackages(): string[] {
  try {
    const output = execSync('npm ls -g --json --depth=0', {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed = JSON.parse(output) as {
      dependencies?: Record<string, unknown>;
    };
    if (!parsed.dependencies) return [];

    const names: string[] = [];
    for (const pkgName of Object.keys(parsed.dependencies)) {
      // Match @karmaniverous/jeeves-{name} but not -openclaw
      const match = /^@karmaniverous\/jeeves-([a-z]+)$/.exec(pkgName);
      if (match && !pkgName.endsWith('-openclaw')) {
        names.push(match[1]);
      }
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * Register proxy subcommands for discovered component CLIs.
 *
 * @remarks
 * For each discovered component, adds `jeeves {name} [args...]`
 * that spawns `jeeves-{name} [args...]` as a child process.
 *
 * @param program - The parent Commander program.
 * @param componentNames - Discovered component names.
 */
export function registerComponentProxies(
  program: Command,
  componentNames: string[],
): void {
  for (const name of componentNames) {
    const binName = `jeeves-${name}`;

    program
      .command(name)
      .description(`Proxy to ${binName} CLI`)
      .allowUnknownOption()
      .allowExcessArguments()
      .action((_opts, cmd: Command) => {
        // Collect all args after the component name
        const args = cmd.args;
        const result = spawnSync(binName, args, {
          stdio: 'inherit',
          shell: true,
        });
        if (result.status !== null && result.status !== 0) {
          process.exitCode = result.status;
        }
      });
  }
}
