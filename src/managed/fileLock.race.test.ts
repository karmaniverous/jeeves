/**
 * Lock acquisition races that cannot be staged with real files: the holder
 * releasing between our `mkdir` and `stat`, another process re-taking a
 * stale lock, and unexpected `stat` errors.
 */

import * as fs from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTempDir } from '../test/tempDir.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    mkdirSync: vi.fn(actual.mkdirSync),
    rmSync: vi.fn(actual.rmSync),
    statSync: vi.fn(actual.statSync),
  };
});

const { withFileLock } = await import('./fileLock.js');

const errno = (code: string) => Object.assign(new Error(code), { code });
const eexist = () => {
  throw errno('EEXIST');
};
const oldStat = () => ({ mtimeMs: Date.now() - 10_000 }) as fs.Stats;

describe('withFileLock races', () => {
  let target: string;
  const tempDir = useTempDir('jeeves-filelock-race-');
  beforeEach(() => {
    target = join(tempDir(), 'config.json');
  });
  afterEach(() => {
    vi.mocked(fs.mkdirSync).mockReset();
    vi.mocked(fs.rmSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.restoreAllMocks();
  });

  it('retries when the holder releases between mkdir and stat', async () => {
    vi.mocked(fs.mkdirSync).mockImplementationOnce(eexist);
    vi.mocked(fs.statSync).mockImplementationOnce(() => {
      throw errno('ENOENT');
    });
    const fn = vi.fn();
    await withFileLock(target, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
  });

  it('gives up with ELOCKED when the lock keeps flickering', async () => {
    vi.mocked(fs.mkdirSync)
      .mockImplementationOnce(eexist)
      .mockImplementationOnce(eexist);
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw errno('ENOENT');
    });
    const fn = vi.fn();
    await expect(withFileLock(target, fn)).rejects.toMatchObject({
      code: 'ELOCKED',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('takes over a stale lock only once', async () => {
    vi.mocked(fs.mkdirSync)
      .mockImplementationOnce(eexist)
      .mockImplementationOnce(eexist);
    vi.mocked(fs.statSync).mockImplementation(oldStat);
    const fn = vi.fn();
    await expect(withFileLock(target, fn, 1_000)).rejects.toMatchObject({
      code: 'ELOCKED',
    });
    expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
    // The second holder's (now fresh-looking) lock is never removed.
    expect(fs.rmSync).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('propagates an unexpected stat error', async () => {
    vi.mocked(fs.mkdirSync).mockImplementationOnce(eexist);
    vi.mocked(fs.statSync).mockImplementationOnce(() => {
      throw errno('EACCES');
    });
    const fn = vi.fn();
    await expect(withFileLock(target, fn)).rejects.toMatchObject({
      code: 'EACCES',
    });
    expect(fn).not.toHaveBeenCalled();
  });
});
