import { describe, expect, it } from 'vitest';

import { CommandFailedError, type CommandRunner } from './commandRunner.js';
import { failed, fakeRunner, ok } from './fakePorts.js';
import {
  assertOpenClawAvailable,
  readPluginsConfig,
  resolveExactVersion,
} from './openclawState.js';

const UNSET = JSON.stringify({
  ok: false,
  error: {
    type: 'cli_error',
    message:
      'Config path is valid but unset: plugins. The runtime default applies…',
  },
});

describe('assertOpenClawAvailable', () => {
  it('returns the version line', async () => {
    const fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6 (eb377ac)\n'),
    });
    await expect(assertOpenClawAvailable(fake.runner)).resolves.toBe(
      'OpenClaw 2026.9.6 (eb377ac)',
    );
  });

  it('explains a missing CLI', async () => {
    const runner: CommandRunner = () =>
      Promise.reject(new Error('spawn openclaw ENOENT'));
    await expect(assertOpenClawAvailable(runner)).rejects.toThrow(
      /OpenClaw CLI not found/,
    );
  });

  it('propagates a non-zero exit', async () => {
    const fake = fakeRunner({ openclaw: failed() });
    await expect(assertOpenClawAvailable(fake.runner)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
  });
});

describe('readPluginsConfig', () => {
  it('parses the plugins slice', async () => {
    const fake = fakeRunner({
      'openclaw config get plugins --json': ok(
        '{"entries":{"a":{"enabled":true}},"load":{"paths":[]}}',
      ),
    });
    await expect(readPluginsConfig(fake.runner)).resolves.toEqual({
      entries: { a: { enabled: true } },
      load: { paths: [] },
    });
  });

  it('treats an unset path as empty', async () => {
    const fake = fakeRunner({
      'openclaw config get': { exitCode: 1, stdout: UNSET, stderr: '' },
    });
    await expect(readPluginsConfig(fake.runner)).resolves.toEqual({});
  });

  it('fails loudly on any other error', async () => {
    const fake = fakeRunner({
      'openclaw config get': {
        exitCode: 1,
        stdout: '{"ok":false,"error":{"message":"Invalid config"}}',
        stderr: '',
      },
    });
    await expect(readPluginsConfig(fake.runner)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
  });

  it('fails loudly when a failed read prints no JSON', async () => {
    const fake = fakeRunner({
      'openclaw config get': failed('gateway config unreadable'),
    });
    await expect(readPluginsConfig(fake.runner)).rejects.toThrow(
      /exit 1\): openclaw config get plugins --json\ngateway config unreadable/,
    );
  });

  it('fails loudly on non-JSON output', async () => {
    const fake = fakeRunner({ 'openclaw config get': ok('not json') });
    await expect(readPluginsConfig(fake.runner)).rejects.toThrow(/non-JSON/);
  });
});

describe('resolveExactVersion', () => {
  const pkg = '@karmaniverous/jeeves-watcher-openclaw';

  it.each([
    ['"0.15.6"', '0.15.6'],
    ['["0.15.0","0.15.5","0.15.6"]', '0.15.6'],
  ])('%s → %s', async (stdout, expected) => {
    const fake = fakeRunner({ npm: ok(stdout) });
    await expect(resolveExactVersion(fake.runner, pkg, '^0.15')).resolves.toBe(
      expected,
    );
    expect(fake.lines()).toEqual([`npm view ${pkg}@^0.15 version --json`]);
  });

  it('rejects an empty match', async () => {
    const fake = fakeRunner({ npm: ok('') });
    await expect(resolveExactVersion(fake.runner, pkg, '^9')).rejects.toThrow(
      /No published version/,
    );
  });

  it('propagates npm failures', async () => {
    const fake = fakeRunner({ npm: failed('E404') });
    await expect(
      resolveExactVersion(fake.runner, pkg, '1.0.0'),
    ).rejects.toThrow(/E404/);
  });
});
