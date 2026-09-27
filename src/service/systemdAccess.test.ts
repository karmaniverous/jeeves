import { describe, expect, it } from 'vitest';

import { execFailure, fakeExec } from '../test/fakeExec';
import {
  assertUserBus,
  runSystemVerb,
  type SystemdDeps,
} from './systemdAccess';

const UNIT = 'jeeves-watcher.service';

function deps(
  script: Record<string, string | Error>,
  env: NodeJS.ProcessEnv = { USER: 'jeeves', XDG_RUNTIME_DIR: '/run/user/999' },
  root = false,
): SystemdDeps & { calls: string[] } {
  const { exec, calls } = fakeExec(script);
  return { exec, env, isRoot: () => root, calls };
}

describe('assertUserBus', () => {
  it('fails early without XDG_RUNTIME_DIR, before calling systemctl', () => {
    const d = deps({}, { USER: 'jeeves' });
    expect(() => {
      assertUserBus(UNIT, d);
    }).toThrow(
      'Cannot manage jeeves-watcher.service as a systemd user unit: there is no systemd user bus for "jeeves" (XDG_RUNTIME_DIR is not set).',
    );
    expect(d.calls).toEqual([]);
  });

  it('names both remedies', () => {
    const d = deps({}, { USER: 'jeeves' });
    expect(() => {
      assertUserBus(UNIT, d);
    }).toThrow(/\/etc\/systemd\/system.*sudo loginctl enable-linger jeeves/);
  });

  it('wraps an unreachable bus instead of the raw systemctl error', () => {
    const d = deps({
      'systemctl --user show-environment': execFailure(
        'Failed to connect to bus: No medium found',
      ),
    });
    expect(() => {
      assertUserBus(UNIT, d);
    }).toThrow(
      /user bus for "jeeves" is unreachable \(Failed to connect to bus: No medium found\)/,
    );
  });

  it('passes when the user bus answers', () => {
    const d = deps({ 'systemctl --user show-environment': 'HOME=/x' });
    expect(() => {
      assertUserBus(UNIT, d);
    }).not.toThrow();
  });

  it('accepts DBUS_SESSION_BUS_ADDRESS without XDG_RUNTIME_DIR', () => {
    const d = deps(
      { 'systemctl --user show-environment': '' },
      { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x' },
    );
    expect(() => {
      assertUserBus(UNIT, d);
    }).not.toThrow();
  });
});

describe('runSystemVerb', () => {
  it.each(['start', 'stop', 'restart'] as const)(
    'runs sudo -n systemctl %s <unit>',
    (verb) => {
      const cmd = `sudo -n systemctl ${verb} ${UNIT}`;
      const d = deps({ [cmd]: '' });
      runSystemVerb(verb, UNIT, d);
      expect(d.calls).toEqual([cmd]);
    },
  );

  it('skips sudo when running as root', () => {
    const d = deps({ [`systemctl restart ${UNIT}`]: '' }, {}, true);
    runSystemVerb('restart', UNIT, d);
    expect(d.calls).toEqual([`systemctl restart ${UNIT}`]);
  });

  it('explains a non-interactive sudo refusal', () => {
    const d = deps({
      [`sudo -n systemctl restart ${UNIT}`]: execFailure(
        'sudo: a password is required',
      ),
    });
    expect(() => {
      runSystemVerb('restart', UNIT, d);
    }).toThrow(
      /refused: passwordless sudo for "\/usr\/bin\/systemctl restart \*" is not granted to "jeeves" \(sudo: a password is required\)/,
    );
  });

  it('passes other failures through with the command', () => {
    const d = deps({
      [`sudo -n systemctl start ${UNIT}`]: execFailure(
        'Job for jeeves-watcher.service failed.',
      ),
    });
    expect(() => {
      runSystemVerb('start', UNIT, d);
    }).toThrow(
      `"sudo -n systemctl start ${UNIT}" failed: Job for jeeves-watcher.service failed.`,
    );
  });
});
