/**
 * Tests for resolveOpenclawDist nvm fallback logic.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');

const mockedExecSync = vi.mocked(execSync);
const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);

describe('resolveOpenClawDist', () => {
  // Dynamic import to pick up fresh mocks each test
  const loadModule = async () => {
    vi.resetModules();
    return import('./resolveOpenclawDist.js');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedOs.homedir.mockReturnValue('/home/jeeves');
  });

  afterEach(() => {
    delete process.env.NVM_DIR;
  });

  it('returns npm root -g path when npm is available', async () => {
    mockedExecSync.mockReturnValue(
      '/home/jeeves/.nvm/versions/node/v24.16.0/lib/node_modules\n',
    );
    mockedFs.existsSync.mockReturnValue(true);

    const { resolveOpenClawDist } = await loadModule();
    const result = resolveOpenClawDist();

    expect(result).toBe(
      path.join(
        '/home/jeeves/.nvm/versions/node/v24.16.0/lib/node_modules',
        'openclaw',
        'dist',
      ),
    );
  });

  it('falls back to nvm current symlink when npm fails', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('npm: command not found');
    });

    const nvmDir = '/home/jeeves/.nvm';
    const versionsNode = path.join(nvmDir, 'versions', 'node');
    const currentLink = path.join(nvmDir, 'current');
    const currentDist = path.join(
      currentLink,
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === versionsNode) return true;
      if (s === currentLink) return true;
      if (s === currentDist) return true;
      return false;
    });

    process.env.NVM_DIR = nvmDir;

    const { resolveOpenClawDist } = await loadModule();
    const result = resolveOpenClawDist();

    expect(result).toBe(currentDist);
  });

  it('falls back to scanning nvm version directories', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('npm: command not found');
    });

    const targetVersion = 'v24.16.0';
    const expectedDist = path.join(
      '/home/jeeves/.nvm',
      'versions',
      'node',
      targetVersion,
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith(path.join('versions', 'node'))) return true;
      if (s.endsWith('current')) return false; // no current symlink
      if (s === expectedDist) return true;
      return false;
    });

    (
      mockedFs.readdirSync as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(['v22.0.0', targetVersion]);

    process.env.NVM_DIR = '/home/jeeves/.nvm';

    const { resolveOpenClawDist } = await loadModule();
    const result = resolveOpenClawDist();

    expect(result).toBe(expectedDist);
  });

  it('prefers newest nvm version', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('npm: command not found');
    });

    const newerDist = path.join(
      '/home/jeeves/.nvm',
      'versions',
      'node',
      'v24.16.0',
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );

    mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith(path.join('versions', 'node'))) return true;
      if (s.endsWith('current')) return false;
      if (s === newerDist) return true;
      // v22 also has it, but v24 should win (sorted reverse)
      if (s.includes('v22.0.0') && s.includes('openclaw/dist')) return true;
      return false;
    });

    (
      mockedFs.readdirSync as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue(['v22.0.0', 'v24.16.0']);

    process.env.NVM_DIR = '/home/jeeves/.nvm';

    const { resolveOpenClawDist } = await loadModule();
    const result = resolveOpenClawDist();

    expect(result).toBe(newerDist);
  });

  it.each([
    [['v9.0.0', 'v24.0.0'], 'v24.0.0'],
    [['v24.0.0', 'v9.0.0'], 'v24.0.0'],
    [['v24.10.0', 'v24.9.0'], 'v24.10.0'],
    [['v24.9.0', 'v24.10.0'], 'v24.10.0'],
  ])(
    'prefers numerically newest across digit widths (%j -> %s)',
    async (dirs, newest) => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('npm: command not found');
      });

      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith(path.join('versions', 'node'))) return true;
        if (s.endsWith('current')) return false;
        // every version has openclaw installed
        return s.endsWith(path.join('openclaw', 'dist'));
      });

      (
        mockedFs.readdirSync as unknown as ReturnType<typeof vi.fn>
      ).mockReturnValue(dirs);

      process.env.NVM_DIR = '/home/jeeves/.nvm';

      const { resolveOpenClawDist } = await loadModule();

      expect(resolveOpenClawDist()).toBe(
        path.join(
          '/home/jeeves/.nvm',
          'versions',
          'node',
          newest,
          'lib',
          'node_modules',
          'openclaw',
          'dist',
        ),
      );
    },
  );

  it('compareNodeVersionsDesc sorts newest first numerically', async () => {
    const { compareNodeVersionsDesc } = await loadModule();

    expect(
      ['v9.0.0', 'v24.9.0', 'v22.1.0', 'v24.10.0', 'v24.0.0'].sort(
        compareNodeVersionsDesc,
      ),
    ).toEqual(['v24.10.0', 'v24.9.0', 'v24.0.0', 'v22.1.0', 'v9.0.0']);
  });

  it('throws descriptive error when all methods fail', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('npm: command not found');
    });

    mockedFs.existsSync.mockReturnValue(false);

    process.env.NVM_DIR = '/home/jeeves/.nvm';

    const { resolveOpenClawDist } = await loadModule();

    expect(() => resolveOpenClawDist()).toThrow(
      'OpenClaw dist directory not found',
    );
    expect(() => resolveOpenClawDist()).toThrow('npm root -g');
    expect(() => resolveOpenClawDist()).toThrow('NVM_DIR');
  });

  it('uses ~/.nvm when NVM_DIR is not set', async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('npm: command not found');
    });

    // No NVM_DIR set, should use os.homedir() + .nvm
    mockedFs.existsSync.mockReturnValue(false);

    const { resolveOpenClawDist } = await loadModule();

    expect(() => resolveOpenClawDist()).toThrow(
      'OpenClaw dist directory not found',
    );
    // Verify it tried the homedir-based path
    expect(mockedFs.existsSync).toHaveBeenCalledWith(
      path.join('/home/jeeves', '.nvm', 'versions', 'node'),
    );
  });
});
