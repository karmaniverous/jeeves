/**
 * Resolves the global npm OpenClaw dist directory.
 *
 * @remarks
 * Used by `jeeves patch-openclaw` to locate the installed OpenClaw
 * distribution before applying runtime dist patches. Falls back to nvm
 * directories when `npm root -g` is not available (e.g. non-interactive
 * shells on managed instances where nvm is only loaded in interactive
 * shell rc files).
 *
 * Hoisted from
 * `jeeves-scripts-template/src/admin/lib/resolve-openclaw-dist.ts`
 * (jeeves-core 0.7.0, #121).
 *
 * @module
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Path of the OpenClaw dist below a global `node_modules`. */
const OPENCLAW_DIST = path.join('openclaw', 'dist');

/** Path of the OpenClaw dist below an nvm node install. */
const NVM_OPENCLAW_DIST = path.join('lib', 'node_modules', OPENCLAW_DIST);

/** Injectable environment for {@link resolveOpenClawDist} (tests). */
export interface ResolveOpenClawDistPorts {
  /** Global `node_modules` path; throws when npm is unavailable. */
  npmRoot?: () => string;
  /** Environment (default `process.env`), for `NVM_DIR`. */
  env?: NodeJS.ProcessEnv;
  /** Home directory (default `os.homedir()`), for `~/.nvm`. */
  home?: string;
}

/** `npm root -g`, trimmed. */
const defaultNpmRoot = (): string =>
  execSync('npm root -g', { encoding: 'utf8', timeout: 10_000 }).trim();

/** Parse `vMAJOR.MINOR.PATCH` into numeric parts (non-numeric parts become 0). */
function parseVersion(dir: string): number[] {
  return dir
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

/**
 * Comparator ordering nvm version directory names newest first by numeric
 * semver (so `v24.10.0` precedes `v24.9.0`, and `v24.0.0` precedes `v9.0.0`).
 */
export function compareNodeVersionsDesc(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The nvm directory: `NVM_DIR`, else `~/.nvm`. */
const nvmDirOf = (ports: ResolveOpenClawDistPorts): string =>
  (ports.env ?? process.env).NVM_DIR ??
  path.join(ports.home ?? os.homedir(), '.nvm');

/** Version directories under `versionsDir`, newest first. */
function nvmVersions(versionsDir: string): string[] {
  try {
    return fs
      .readdirSync(versionsDir)
      .filter((d) => d.startsWith('v'))
      .sort(compareNodeVersionsDesc);
  } catch {
    return [];
  }
}

/**
 * Candidate dist directories, in lookup order: `npm root -g`, then
 * `<nvm>/current` (the symlink jeeves-tools bootstrap creates), then each
 * `<nvm>/versions/node/v*`, newest first. `<nvm>` is `NVM_DIR`, else
 * `~/.nvm`.
 */
function candidates(ports: ResolveOpenClawDistPorts): string[] {
  const nvmDir = nvmDirOf(ports);
  const versionsDir = path.join(nvmDir, 'versions', 'node');

  const fromNpm: string[] = [];
  try {
    fromNpm.push(path.join((ports.npmRoot ?? defaultNpmRoot)(), OPENCLAW_DIST));
  } catch {
    // npm not on PATH: fall through to nvm.
  }

  return [
    ...fromNpm,
    path.join(nvmDir, 'current', NVM_OPENCLAW_DIST),
    ...nvmVersions(versionsDir).map((v) =>
      path.join(versionsDir, v, NVM_OPENCLAW_DIST),
    ),
  ];
}

/**
 * Resolve the global npm OpenClaw dist directory.
 *
 * @param ports - Injectable environment (tests).
 * @returns The first existing candidate dist directory.
 * @throws When no candidate exists; the message lists what was checked.
 */
export function resolveOpenClawDist(
  ports: ResolveOpenClawDistPorts = {},
): string {
  const nvmDir = nvmDirOf(ports);
  const found = candidates(ports).find((dir) => fs.existsSync(dir));
  if (found) return found;

  throw new Error(
    'OpenClaw dist directory not found. Checked: npm root -g, ' +
      `${path.join(nvmDir, 'current', NVM_OPENCLAW_DIST)}, ` +
      `${path.join(nvmDir, 'versions', 'node', '*', NVM_OPENCLAW_DIST)} ` +
      'Is openclaw installed globally?',
  );
}
