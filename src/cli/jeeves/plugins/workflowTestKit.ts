/**
 * Shared fixtures for plugin workflow and command tests: plugin ids, install
 * records, fake runner with the standard read-only responses, fake legacy fs,
 * fake temp files, and the workflow deps the command tests wire in.
 * Test-only helper.
 *
 * @module
 */

import {
  type FakeRunner,
  fakeRunner,
  type FakeTempFiles,
  fakeTempFiles,
  ok,
} from './fakePorts.js';
import type { LegacyFs } from './legacyExtensions.js';
import type { ServerKeyWrite } from './serverKeySync.js';
import type { PluginWorkflowDeps } from './workflows.js';

/** Watcher plugin id. */
export const W = 'jeeves-watcher-openclaw';
/** Runner plugin id. */
export const R = 'jeeves-runner-openclaw';
/** Server plugin id. */
export const S = 'jeeves-server-openclaw';
/** Meta plugin id. */
export const M = 'jeeves-meta-openclaw';
/** Watcher package. */
export const WPKG = `@karmaniverous/${W}`;
/** Runner package. */
export const RPKG = `@karmaniverous/${R}`;
/** Server package. */
export const SPKG = `@karmaniverous/${S}`;

/** OpenClaw config dir used by the fixtures. */
export const CONFIG_DIR = '/oc';

/**
 * An `openclaw plugins inspect --all --json` entry for an npm install.
 *
 * @param id - Plugin id.
 * @param pkg - Package name.
 * @param version - Installed version.
 * @returns The inspect entry.
 */
export const npmRecord = (id: string, pkg: string, version: string) => ({
  plugin: { id, version },
  install: {
    source: 'npm',
    spec: `${pkg}@${version}`,
    resolvedName: pkg,
    resolvedVersion: version,
  },
});

/**
 * Legacy extension dir of a plugin (forward slashes).
 *
 * @param id - Plugin id.
 * @returns Path.
 */
export const legacy = (id: string): string =>
  ['', 'oc', 'extensions', id].join('/');

/**
 * Standard read-only responses: OpenClaw version, no install records,
 * versions watcher 0.16.0 (declares before_prompt_build), runner 0.9.0 and
 * server 0.14.0 (declare nothing).
 */
export const STANDARD_SCRIPT = {
  'openclaw --version': ok('OpenClaw 2026.9.6'),
  'openclaw plugins inspect --all --json': ok('[]'),
  [`npm view ${WPKG}`]: ok('"0.16.0"'),
  [`npm view ${WPKG}@0.16.0 jeeves.conversationHooks`]: ok(
    '["before_prompt_build"]',
  ),
  [`npm view ${RPKG}`]: ok('"0.9.0"'),
  [`npm view ${RPKG}@0.9.0 jeeves.conversationHooks`]: ok(''),
  [`npm view ${SPKG}`]: ok('"0.14.0"'),
  [`npm view ${SPKG}@0.14.0 jeeves.conversationHooks`]: ok(''),
};

/** Workflow fixture. */
export interface WorkflowFixture {
  /** Fake runner. */
  fake: FakeRunner;
  /** Fake temp files. */
  temp: FakeTempFiles;
  /** Legacy dirs removed. */
  removed: string[];
  /** Logged lines. */
  log: string[];
  /** Server `keys._plugin` writes performed. */
  serverWrites: ServerKeyWrite[];
  /** Workflow deps wired to the fakes. */
  deps: PluginWorkflowDeps;
}

/**
 * Build a workflow fixture.
 *
 * @param script - Extra runner responses (override the standard ones).
 * @param legacyPkgs - Legacy dirs (forward-slash path → package name).
 * @param dryRun - Dry run.
 * @returns The fixture.
 */
export function setupWorkflow(
  script: Parameters<typeof fakeRunner>[0] = {},
  legacyPkgs: Record<string, string> = {},
  dryRun = false,
): WorkflowFixture {
  const fake = fakeRunner({ ...STANDARD_SCRIPT, ...script });
  const removed: string[] = [];
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const fs: LegacyFs = {
    isDirectory: (p) => norm(p) in legacyPkgs && !removed.includes(norm(p)),
    readPackageName: (d) => legacyPkgs[norm(d)],
    removeDir: (p) => {
      removed.push(norm(p));
    },
  };
  const temp = fakeTempFiles();
  const log: string[] = [];
  const serverWrites: ServerKeyWrite[] = [];
  const deps: PluginWorkflowDeps = {
    runner: fake.runner,
    fs,
    tempFiles: temp.files,
    serverConfig: (write) => {
      serverWrites.push(write);
      return Promise.resolve(`${write.path}.bak-test`);
    },
    configDir: CONFIG_DIR,
    log: (l) => log.push(l),
    dryRun,
  };
  return { fake, temp, removed, log, serverWrites, deps };
}

/** Legacy fs with no legacy plugin copies. */
const NO_LEGACY_FS: LegacyFs = {
  isDirectory: () => false,
  readPackageName: () => undefined,
  removeDir: () => undefined,
};

/** Fakes a command test swaps in (per test) for the real ports. */
export interface CommandTestPorts {
  /** Fake runner (required when deps are built). */
  fake?: FakeRunner;
  /** Fake temp files (default: fresh ones). */
  temp?: FakeTempFiles;
}

/**
 * Workflow deps for command tests (the mocked `createPluginWorkflowDeps`):
 * the current fakes, no legacy plugin copies, config dir {@link CONFIG_DIR},
 * log to `console.log` (so the command's output capture sees it).
 *
 * @param ports - The test's current fakes.
 * @param serverConfig - Server config writer.
 * @param dryRun - Dry run.
 * @returns Deps.
 */
export function commandWorkflowDeps(
  ports: CommandTestPorts,
  serverConfig: PluginWorkflowDeps['serverConfig'],
  dryRun: boolean,
): PluginWorkflowDeps {
  if (!ports.fake) throw new Error('no fake runner');
  return {
    runner: ports.fake.runner,
    fs: NO_LEGACY_FS,
    tempFiles: (ports.temp ?? fakeTempFiles()).files,
    serverConfig,
    configDir: CONFIG_DIR,
    log: (line) => {
      console.log(line);
    },
    dryRun,
  };
}

/**
 * Mutating command lines among recorded calls.
 *
 * @param lines - Recorded command lines.
 * @returns Only `plugins install/uninstall` and `config set/unset` lines.
 */
export const mutating = (lines: string[]): string[] =>
  lines.filter((l) =>
    / plugins (install|uninstall) | config (set|unset) /.test(` ${l} `),
  );

/** Prefix of every batch-file config write. */
export const BATCH_PREFIX = 'openclaw config set --batch-file ';
