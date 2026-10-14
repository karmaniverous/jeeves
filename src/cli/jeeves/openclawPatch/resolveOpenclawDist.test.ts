import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  compareNodeVersionsDesc,
  resolveOpenClawDist,
} from './resolveOpenclawDist.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-openclaw-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Create a directory under the temp root and return its path. */
const mk = (...parts: string[]): string => {
  const dir = path.join(root, ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const noNpm = (): string => {
  throw new Error('npm: command not found');
};

const nvmDist = (nvm: string, ...below: string[]): string =>
  path.join(nvm, ...below, 'lib', 'node_modules', 'openclaw', 'dist');

describe('resolveOpenClawDist', () => {
  it('prefers the npm global root', () => {
    const dist = mk('npm', 'openclaw', 'dist');
    mk('nvm', 'current', 'lib', 'node_modules', 'openclaw', 'dist');

    expect(
      resolveOpenClawDist({
        npmRoot: () => path.join(root, 'npm'),
        env: { NVM_DIR: path.join(root, 'nvm') },
      }),
    ).toBe(dist);
  });

  it('falls back to <nvm>/current when npm is unavailable', () => {
    const nvm = path.join(root, 'nvm');
    mk('nvm', 'current', 'lib', 'node_modules', 'openclaw', 'dist');

    expect(resolveOpenClawDist({ npmRoot: noNpm, env: { NVM_DIR: nvm } })).toBe(
      nvmDist(nvm, 'current'),
    );
  });

  it('finds <nvm>/current even when there is no versions directory', () => {
    const nvm = path.join(root, 'nvm');
    mk('nvm', 'current', 'lib', 'node_modules', 'openclaw', 'dist');
    expect(fs.existsSync(path.join(nvm, 'versions'))).toBe(false);

    expect(resolveOpenClawDist({ npmRoot: noNpm, env: { NVM_DIR: nvm } })).toBe(
      nvmDist(nvm, 'current'),
    );
  });

  it('falls back to npm root output that has no OpenClaw install', () => {
    mk('npm');
    const nvm = path.join(root, 'nvm');
    mk(
      'nvm',
      'versions',
      'node',
      'v24.1.0',
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );

    expect(
      resolveOpenClawDist({
        npmRoot: () => path.join(root, 'npm'),
        env: { NVM_DIR: nvm },
      }),
    ).toBe(nvmDist(nvm, 'versions', 'node', 'v24.1.0'));
  });

  it('scans nvm versions newest first, skipping versions without OpenClaw', () => {
    const nvm = path.join(root, 'nvm');
    for (const v of ['v9.0.0', 'v24.9.0', 'v24.10.0']) {
      mk(
        'nvm',
        'versions',
        'node',
        v,
        'lib',
        'node_modules',
        'openclaw',
        'dist',
      );
    }
    mk('nvm', 'versions', 'node', 'v25.0.0');

    expect(resolveOpenClawDist({ npmRoot: noNpm, env: { NVM_DIR: nvm } })).toBe(
      nvmDist(nvm, 'versions', 'node', 'v24.10.0'),
    );
  });

  it('uses ~/.nvm when NVM_DIR is not set', () => {
    const home = mk('home');
    mk('home', '.nvm', 'current', 'lib', 'node_modules', 'openclaw', 'dist');

    expect(resolveOpenClawDist({ npmRoot: noNpm, env: {}, home })).toBe(
      nvmDist(path.join(home, '.nvm'), 'current'),
    );
  });

  it('throws naming every path it checked', () => {
    const nvm = path.join(root, 'nvm');
    const attempt = (): string =>
      resolveOpenClawDist({ npmRoot: noNpm, env: { NVM_DIR: nvm } });

    expect(attempt).toThrow('OpenClaw dist directory not found');
    expect(attempt).toThrow('npm root -g');
    expect(attempt).toThrow(nvmDist(nvm, 'current'));
    expect(attempt).toThrow(nvmDist(nvm, 'versions', 'node', '*'));
  });
});

describe('compareNodeVersionsDesc', () => {
  it('sorts newest first numerically across digit widths', () => {
    expect(
      ['v9.0.0', 'v24.9.0', 'v22.1.0', 'v24.10.0', 'v24.0.0'].sort(
        compareNodeVersionsDesc,
      ),
    ).toEqual(['v24.10.0', 'v24.9.0', 'v24.0.0', 'v22.1.0', 'v9.0.0']);
  });
});
