import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CommandFailedError,
  runChecked,
  spawnCommandRunner,
} from './commandRunner.js';
import { failed, fakeRunner, ok } from './fakePorts.js';

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

  it.each([
    [
      'stderr is empty: the stdout tail',
      { stdout: 'out line', stderr: '' },
      'out line',
    ],
    ['both are empty: no detail line', { stdout: ' ', stderr: '' }, undefined],
  ])('reports, when %s', async (_label, output, detail) => {
    const fake = fakeRunner({ openclaw: { exitCode: 4, ...output } });
    const err = (await runChecked(fake.runner, 'openclaw', ['x']).catch(
      (e: unknown) => e,
    )) as CommandFailedError;
    expect(err.message).toBe(
      `Command failed (exit 4): openclaw x${detail ? `\n${detail}` : ''}`,
    );
  });

  it('keeps only the last 10 output lines in the message', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `l${String(i)}`);
    const fake = fakeRunner({ openclaw: failed(lines.join('\n')) });
    const err = (await runChecked(fake.runner, 'openclaw', []).catch(
      (e: unknown) => e,
    )) as CommandFailedError;
    expect(err.message.split('\n').slice(1)).toEqual(lines.slice(2));
  });

  it('redacts secrets from the error message and captured output', async () => {
    const fake = fakeRunner({ openclaw: failed('bad value s3cr3t', 1) });
    const err = (await runChecked(
      fake.runner,
      'openclaw',
      ['config', 'get', 's3cr3t'],
      { redact: ['s3cr3t'] },
    ).catch((e: unknown) => e)) as CommandFailedError;
    expect(err.message).not.toContain('s3cr3t');
    expect(err.message).toContain('<redacted>');
    expect(err.result.stderr).toBe('bad value <redacted>');
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

  it('streams stderr as it arrives when echoing without secrets', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const errWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const pending = spawnCommandRunner('npm', ['view'], { echo: true });
    child.stderr.write('npm warn');
    await vi.waitFor(() => {
      expect(errWrite).toHaveBeenCalledWith('npm warn');
    });
    child.emit('close', 0);
    await expect(pending).resolves.toMatchObject({ stderr: 'npm warn' });
  });

  it('does not echo unless asked', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const pending = spawnCommandRunner('npm', ['view']);
    child.stdout.write('quiet');
    child.emit('close', 0);
    await expect(pending).resolves.toMatchObject({ stdout: 'quiet' });
    expect(write).not.toHaveBeenCalled();
  });

  it('buffers and redacts echoed output when secrets are present', async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const pending = spawnCommandRunner('openclaw', ['x'], {
      echo: true,
      redact: ['s3cr3t'],
    });
    child.stdout.write('set s3');
    child.stdout.write('cr3t ok');
    expect(write).not.toHaveBeenCalled();
    child.emit('close', 0);
    const result = await pending;
    expect(write).toHaveBeenCalledWith('set <redacted> ok');
    expect(result.stdout).toBe('set s3cr3t ok');
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
