/**
 * Discovery of installed Jeeves component CLIs, and `jeeves <name>` proxies
 * to them (spec 5.9, #142).
 *
 * @remarks
 * 1. `npm ls -g --json --depth=0` lists the global packages.
 * 2. Candidates are `@karmaniverous/jeeves-<name>` with `<name>` matching
 *    {@link COMPONENT_NAME} and not ending in `-openclaw`.
 * 3. A candidate registers when `<name>` is one of the four services, or its
 *    `package.json` has `"jeeves": { "component": true }`.
 * 4. The proxy runs the package's bin (the `jeeves-<name>` entry, else its
 *    only entry), resolved under the global root, with Node through
 *    `cross-spawn` and `shell: false`, forwarding arguments, stdio and exit
 *    code.
 *
 * @module
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Command } from '@commander-js/extra-typings';
import spawn from 'cross-spawn';

/** Component names a candidate may have. */
export const COMPONENT_NAME = /^[a-z][a-z0-9-]*$/;

/** The services that register without the package marker. */
export const SERVICE_COMPONENTS = ['runner', 'watcher', 'server', 'meta'];

/** npm scope of component packages. */
const SCOPE = '@karmaniverous/jeeves-';

/** A discovered component CLI. */
export interface DiscoveredComponent {
  /** Component name (`jeeves <name>`). */
  name: string;
  /** Absolute path of the bin script. */
  bin: string;
}

/** What discovery reads; injectable for tests. */
export interface DiscoveryPorts {
  /** Output of `npm ls -g --json --depth=0`. */
  listGlobal: () => string;
  /** Output of `npm root -g`. */
  globalRoot: () => string;
  /** Parsed `package.json` of a package directory. */
  readPackageJson: (dir: string) => unknown;
}

/** Shape of the `package.json` fields discovery reads. */
interface PackageJson {
  bin?: string | Record<string, string>;
  jeeves?: { component?: unknown };
}

/** Run an npm command and return its stdout. */
const npm = (args: string): string =>
  execSync(`npm ${args}`, {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

/** The real ports. */
export const defaultDiscoveryPorts: DiscoveryPorts = {
  listGlobal: () => npm('ls -g --json --depth=0'),
  globalRoot: () => npm('root -g').trim(),
  readPackageJson: (dir) =>
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as unknown,
};

/**
 * Candidate component names among global package names.
 *
 * @param packageNames - Global package names.
 * @returns Names after the scope prefix that pass the filter.
 */
export function componentCandidates(packageNames: string[]): string[] {
  return packageNames
    .filter((p) => p.startsWith(SCOPE))
    .map((p) => p.slice(SCOPE.length))
    .filter((n) => COMPONENT_NAME.test(n) && !n.endsWith('-openclaw'));
}

/**
 * The bin script of a package: the `jeeves-<name>` entry, else its only one.
 *
 * @param name - Component name.
 * @param pkg - Its `package.json`.
 * @returns The bin path relative to the package, or `undefined`.
 */
export function componentBin(
  name: string,
  pkg: PackageJson,
): string | undefined {
  if (typeof pkg.bin === 'string') return pkg.bin;
  const entries = Object.entries(pkg.bin ?? {});
  const named = entries.find(([key]) => key === `jeeves-${name}`);
  if (named) return named[1];
  return entries.length === 1 ? entries[0][1] : undefined;
}

/**
 * Discover globally installed component CLIs. Never throws: a failing npm
 * yields none, and an unreadable candidate is skipped.
 *
 * @param ports - What to read (default: npm and the file system).
 * @returns The components, in `npm ls` order.
 */
export function discoverComponentPackages(
  ports: DiscoveryPorts = defaultDiscoveryPorts,
): DiscoveredComponent[] {
  let names: string[];
  let root: string;
  try {
    const parsed = JSON.parse(ports.listGlobal()) as {
      dependencies?: Record<string, unknown>;
    };
    names = componentCandidates(Object.keys(parsed.dependencies ?? {}));
    if (names.length === 0) return [];
    root = ports.globalRoot();
  } catch {
    return [];
  }
  const found: DiscoveredComponent[] = [];
  for (const name of names) {
    const dir = join(root, `${SCOPE}${name}`);
    try {
      const pkg = ports.readPackageJson(dir) as PackageJson;
      if (!SERVICE_COMPONENTS.includes(name) && pkg.jeeves?.component !== true)
        continue;
      const bin = componentBin(name, pkg);
      if (bin) found.push({ name, bin: resolve(dir, bin) });
    } catch {
      // Unreadable package: not registered.
    }
  }
  return found;
}

/** Runs a bin with Node; returns its exit status. */
export type BinRunner = (bin: string, args: string[]) => number | null;

/** Run a bin script with this Node, `shell: false`, stdio inherited. */
export const runBin: BinRunner = (bin, args) =>
  spawn.sync(process.execPath, [bin, ...args], {
    stdio: 'inherit',
    shell: false,
  }).status;

/**
 * Register `jeeves <name> [args...]` proxies for discovered components.
 *
 * @param program - The parent Commander program.
 * @param components - Discovered components.
 * @param run - Runs a bin (default {@link runBin}).
 */
export function registerComponentProxies(
  program: Command,
  components: DiscoveredComponent[],
  run: BinRunner = runBin,
): void {
  for (const { name, bin } of components) {
    program
      .command(name)
      .description(`Proxy to jeeves-${name} CLI`)
      .helpOption(false)
      .allowUnknownOption()
      .allowExcessArguments()
      .action((_opts, cmd: Command) => {
        const status = run(bin, cmd.args);
        if (status !== null && status !== 0) process.exitCode = status;
      });
  }
}
