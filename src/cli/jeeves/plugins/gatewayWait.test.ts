import { describe, expect, it } from 'vitest';

import type { CommandRunner } from './commandRunner.js';
import { failed, fakeRunner, ok } from './fakePorts.js';
import {
  DEFAULT_GATEWAY_WAIT,
  lastOutputLine,
  pollUntil,
  probeGateway,
  waitForGateway,
} from './gatewayWait.js';

const clockPorts = () => {
  let now = 0;
  const slept: number[] = [];
  return {
    slept,
    ports: {
      clock: () => now,
      sleep: (ms: number) => {
        slept.push(ms);
        now += ms;
        return Promise.resolve();
      },
      policy: DEFAULT_GATEWAY_WAIT,
    },
  };
};

describe('probeGateway', () => {
  it('runs gateway status --require-rpc and reports success as undefined', async () => {
    const fake = fakeRunner();
    await expect(probeGateway(fake.runner)).resolves.toBeUndefined();
    expect(fake.lines()).toEqual([
      'openclaw gateway status --require-rpc --timeout 10000',
    ]);
  });

  it('describes a failed probe and a spawn error', async () => {
    const fake = fakeRunner({ 'openclaw gateway': failed('rpc timeout', 1) });
    await expect(probeGateway(fake.runner)).resolves.toBe(
      'openclaw gateway status --require-rpc --timeout 10000 exited 1 (rpc timeout)',
    );
    const broken: CommandRunner = () => Promise.reject(new Error('ENOENT'));
    await expect(probeGateway(broken)).resolves.toBe('ENOENT');
  });
});

describe('pollUntil', () => {
  it('backs off (doubling, capped) and never sleeps past the deadline', async () => {
    const { ports, slept } = clockPorts();
    const outcome = await pollUntil(ports, 40_000, () =>
      Promise.resolve({ done: false as const, observed: 'busy' }),
    );
    expect(outcome).toEqual({ ok: false, observed: 'busy' });
    expect(slept).toEqual([2_000, 4_000, 8_000, 15_000, 11_000]);
  });

  it('returns the value as soon as an attempt is done', async () => {
    const { ports, slept } = clockPorts();
    let n = 0;
    const outcome = await pollUntil(ports, 60_000, () =>
      Promise.resolve(
        ++n < 3
          ? { done: false as const, observed: 'busy' }
          : { done: true as const, value: n },
      ),
    );
    expect(outcome).toEqual({ ok: true, value: 3 });
    expect(slept).toEqual([2_000, 4_000]);
  });
});

describe('waitForGateway', () => {
  it('reports each wait and succeeds once the gateway answers', async () => {
    const { ports } = clockPorts();
    const fake = fakeRunner({
      'openclaw gateway': [failed('a'), failed('b'), ok()],
    });
    const seen: string[] = [];
    const outcome = await waitForGateway(
      { ...ports, runner: fake.runner, log: () => undefined },
      180_000,
      (observed) => seen.push(observed),
    );
    expect(outcome.ok).toBe(true);
    expect(seen).toHaveLength(2);
  });
});

describe('lastOutputLine', () => {
  it('prefers the last non-empty line of stdout then stderr', () => {
    expect(
      lastOutputLine({ exitCode: 1, stdout: 'a\n\n', stderr: 'b\n' }),
    ).toBe('b');
    expect(lastOutputLine({ exitCode: 1, stdout: '', stderr: '' })).toBe('');
  });
});
