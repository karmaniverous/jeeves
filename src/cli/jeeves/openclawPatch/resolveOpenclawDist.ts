/**
 * Resolves the global npm OpenClaw dist directory.
 *
 * @remarks
 * Used by `jeeves patch-openclaw` to locate the installed OpenClaw
 * distribution before applying runtime dist patches. Falls back to
 * scanning nvm directories when `npm root -g` is not available (e.g.
 * non-interactive shells on managed instances where nvm is only loaded in
 * interactive shell rc files).
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

/** Try resolving via `npm root -g`. Returns the dist path or null. */
function tryNpmRoot(): string | null {
  try {
    const npmRoot = execSync('npm root -g', {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    const distDir = path.join(npmRoot, 'openclaw', 'dist');
    if (fs.existsSync(distDir)) return distDir;
  } catch {
    // npm not on PATH — fall through to nvm fallback
  }
  return null;
}

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

/**
 * Scan nvm node version directories for an OpenClaw global install.
 * Checks `NVM_DIR` env var, then falls back to `~/.nvm`.
 */
function tryNvmFallback(): string | null {
  const nvmDir = process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm');
  const versionsDir = path.join(nvmDir, 'versions', 'node');

  if (!fs.existsSync(versionsDir)) return null;

  // Check 'current' symlink first (created by jeeves-tools bootstrap)
  const currentLink = path.join(nvmDir, 'current');
  if (fs.existsSync(currentLink)) {
    const distDir = path.join(
      currentLink,
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );
    if (fs.existsSync(distDir)) return distDir;
  }

  // Scan version directories, newest first by numeric semver
  const versions = fs
    .readdirSync(versionsDir)
    .filter((d) => d.startsWith('v'))
    .sort(compareNodeVersionsDesc);

  for (const version of versions) {
    const distDir = path.join(
      versionsDir,
      version,
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );
    if (fs.existsSync(distDir)) return distDir;
  }

  return null;
}

/** Resolve the global npm OpenClaw dist directory. */
export function resolveOpenClawDist(): string {
  const distDir = tryNpmRoot() ?? tryNvmFallback();

  if (!distDir) {
    throw new Error(
      'OpenClaw dist directory not found. ' +
        'Checked: npm root -g, NVM_DIR/versions/node/*/lib/node_modules/openclaw/dist, ' +
        '~/.nvm/current/lib/node_modules/openclaw/dist. ' +
        'Is openclaw installed globally?',
    );
  }

  return distDir;
}
