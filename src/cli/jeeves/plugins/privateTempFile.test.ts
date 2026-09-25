import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { failed, fakeRunner, fakeTempFiles } from './fakePorts.js';
import {
  createNodePrivateTempFiles,
  icaclsRestrictArgs,
  windowsAccount,
  withPrivateTempFile,
} from './privateTempFile.js';

describe('withPrivateTempFile', () => {
  it('restricts the directory before writing, then removes it', async () => {
    const temp = fakeTempFiles();
    const order: string[] = [];
    const files = {
      ...temp.files,
      restrictDir: async (d: string) => {
        order.push('restrict');
        return temp.files.restrictDir(d);
      },
      writeNewFile: (p: string, c: string) => {
        order.push('write');
        temp.files.writeNewFile(p, c);
      },
    };
    const result = await withPrivateTempFile(
      files,
      'b.json',
      '[1]',
      (path) => {
        order.push('run');
        return Promise.resolve(path.replace(/\\/g, '/'));
      },
      () => undefined,
    );
    expect(result).toBe('/tmp/jeeves-1/b.json');
    expect(order).toEqual(['restrict', 'write', 'run']);
    expect(temp.removed).toEqual(['/tmp/jeeves-1']);
  });

  it('removes the directory when the callback throws', async () => {
    const temp = fakeTempFiles();
    await expect(
      withPrivateTempFile(
        temp.files,
        'b.json',
        'x',
        () => Promise.reject(new Error('boom')),
        () => undefined,
      ),
    ).rejects.toThrow('boom');
    expect(temp.removed).toEqual(['/tmp/jeeves-1']);
  });

  it('warns and continues when the ACL cannot be restricted', async () => {
    const temp = fakeTempFiles('icacls exited 5');
    const warnings: string[] = [];
    await withPrivateTempFile(
      temp.files,
      'b.json',
      'x',
      () => Promise.resolve(),
      (l) => warnings.push(l),
    );
    expect(warnings).toEqual([
      'warning: could not restrict /tmp/jeeves-1 to the current user (icacls exited 5); relying on the private temp directory',
    ]);
    expect(temp.written).toHaveLength(1);
  });
});

describe('icacls helpers', () => {
  it('removes inherited entries and grants only the user', () => {
    expect(icaclsRestrictArgs('C:\\t\\d', 'DOM\\me')).toEqual([
      'C:\\t\\d',
      '/inheritance:r',
      '/grant:r',
      'DOM\\me:(OI)(CI)F',
    ]);
  });

  it('qualifies the account with USERDOMAIN when set', () => {
    expect(windowsAccount({ USERDOMAIN: 'DOM' }, 'me')).toBe('DOM\\me');
    expect(windowsAccount({}, 'me')).toBe('me');
  });
});

describe('createNodePrivateTempFiles', () => {
  let base: string;

  beforeEach(() => {
    base = join(
      tmpdir(),
      `jeeves-ptf-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(base, { recursive: true });
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('writes an owner-only file in a fresh directory and removes it', async () => {
    const fake = fakeRunner();
    const files = createNodePrivateTempFiles(fake.runner, 'linux', base);
    let seen = '';
    let content = '';
    let modes: [number, number] = [0, 0];
    await withPrivateTempFile(
      files,
      'b.json',
      'secret',
      (path) => {
        seen = path;
        content = readFileSync(path, 'utf-8');
        modes = [
          statSync(path).mode & 0o777,
          statSync(join(path, '..')).mode & 0o777,
        ];
        return Promise.resolve();
      },
      () => undefined,
    );
    expect(content).toBe('secret');
    // POSIX permission bits are only meaningful off Windows.
    expect(process.platform === 'win32' || modes[0] === 0o600).toBe(true);
    expect(process.platform === 'win32' || modes[1] === 0o700).toBe(true);
    expect(seen.startsWith(join(base, 'jeeves-'))).toBe(true);
    expect(existsSync(join(seen, '..'))).toBe(false);
    expect(fake.calls).toEqual([]); // no icacls off Windows
  });

  it('never overwrites an existing file', () => {
    const files = createNodePrivateTempFiles(
      fakeRunner().runner,
      'linux',
      base,
    );
    const path = join(base, 'exists.json');
    writeFileSync(path, 'old');
    expect(() => {
      files.writeNewFile(path, 'new');
    }).toThrow();
    expect(readFileSync(path, 'utf-8')).toBe('old');
  });

  it('runs icacls on Windows and reports its failure', async () => {
    const ok = fakeRunner();
    const dir = join(base, 'd');
    await expect(
      createNodePrivateTempFiles(ok.runner, 'win32', base).restrictDir(dir),
    ).resolves.toBeUndefined();
    expect(ok.calls[0].command).toBe('icacls');
    expect(ok.calls[0].args.slice(0, 3)).toEqual([
      dir,
      '/inheritance:r',
      '/grant:r',
    ]);

    const bad = fakeRunner({ icacls: failed('denied', 5) });
    await expect(
      createNodePrivateTempFiles(bad.runner, 'win32', base).restrictDir(dir),
    ).resolves.toMatch(/exited 5$/);

    const missing = createNodePrivateTempFiles(
      () => Promise.reject(new Error('spawn icacls ENOENT')),
      'win32',
      base,
    );
    await expect(missing.restrictDir(dir)).resolves.toBe('spawn icacls ENOENT');
  });
});
