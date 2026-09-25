import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CommandFailedError,
  formatCommand,
  quoteArg,
  runChecked,
  spawnCommandRunner,
} from './commandRunner.js';
import { failed, fakeRunner, ok } from './testRunner.js';

/** Minimal fake ChildProcess. */
class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('cross-spawn', () => ({ default: spawnMock }));

afterEach(() => {
  spawnMock.mockReset();
  vi.restoreAllMocks();
});

describe('quoteArg / formatCommand', () => {
  it.each([
    ['plugins', 'plugins'],
    [
      'npm:@karmaniverous/x-openclaw@1.0.0',
      'npm:@karmaniverous/x-openclaw@1.0.0',
    ],
    ['', "''"],
    ['[{"path":"a b"}]', `'[{"path":"a b"}]'`],
    ["it's", `'it'\\''s'`],
  ])('%j → %s', (arg, expected) => {
    expect(quoteArg(arg)).toBe(expected);
  });

  it('joins a command line', () => {
    expect(formatCommand('openclaw', ['config', 'get', 'plugins'])).toBe(
      'openclaw config get plugins',
    );
  });
});

describe('runChecked', () => {
  it('returns the result on exit 0', async () => {
    const fake = fakeRunner({ 'openclaw --version': ok('OpenClaw 2026.9.6') });
    await expect(
      runChecked(fake.runner, 'openclaw', ['--version']),
    ).resolves.toEqual(ok('OpenClaw 2026.9.6'));
  });

  it('throws CommandFailedError with command, exit code and stderr tail', async () => {
    const fake = fakeRunner({ openclaw: failed('Plugin install failed', 3) });
    const err = await runChecked(fake.runner, 'openclaw', [
      'plugins',
      'install',
      'x',
    ]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandFailedError);
    expect((err as CommandFailedError).message).toMatch(
      /exit 3\): openclaw plugins install x\nPlugin install failed/,
    );
    expect((err as CommandFailedError).result.exitCode).toBe(3);
  });
});

describe('spawnCommandRunner', () => {
  it('spawns without a shell and captures output and exit code', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const pending = spawnCommandRunner('openclaw', [
      'config',
      'get',
      'plugins',
    ]);
    child.stdout.write('{"a":1}');
    child.stderr.write('warn');
    child.emit('close', 2);
    await expect(pending).resolves.toEqual({
      exitCode: 2,
      stdout: '{"a":1}',
      stderr: 'warn',
    });
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { shell?: unknown; stdio: unknown },
    ];
    expect(cmd).toBe('openclaw');
    expect(args).toEqual(['config', 'get', 'plugins']);
    expect(opts.shell).toBeUndefined();
  });

  it('echoes output when asked', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const pending = spawnCommandRunner('npm', ['view'], { echo: true });
    child.stdout.write('1.0.0');
    child.emit('close', 0);
    await pending;
    expect(write).toHaveBeenCalledWith('1.0.0');
  });

  it('treats a signal kill as failure', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const pending = spawnCommandRunner('openclaw', []);
    child.emit('close', null);
    await expect(pending).resolves.toMatchObject({ exitCode: 1 });
  });

  it('rejects when the executable cannot be spawned', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const pending = spawnCommandRunner('openclaw', ['--version']);
    child.emit(
      'error',
      Object.assign(new Error('spawn openclaw ENOENT'), { code: 'ENOENT' }),
    );
    await expect(pending).rejects.toThrow(/ENOENT/);
  });
});
