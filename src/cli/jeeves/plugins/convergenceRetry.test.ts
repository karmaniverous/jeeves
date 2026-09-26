import { describe, expect, it, vi } from 'vitest';

import { CommandFailedError } from './commandRunner.js';
import {
  DEFAULT_CONVERGENCE_RETRY,
  retryDelays,
  timerSleep,
  unconvergedPlugins,
  withConvergenceRetry,
} from './convergenceRetry.js';

const OPENCLAW_REFUSAL =
  'Cannot edit retained config at "plugins.entries.jeeves-meta-openclaw.config". Plugin "jeeves-meta-openclaw" data/settings upgrade is unfinished: The configured plugin package is missing or has not converged. Your existing data and settings have been kept. Run "openclaw doctor --fix" to retry the upgrade.';

const failure = (stderr: string, stdout = ''): CommandFailedError =>
  new CommandFailedError('openclaw config set --batch-file x', {
    exitCode: 1,
    stdout,
    stderr,
  });

describe('unconvergedPlugins', () => {
  it.each([
    ['a non-command error', new Error(OPENCLAW_REFUSAL), undefined],
    ['an unrelated failure', failure('Config validation failed'), undefined],
    [
      'the refusal on stderr',
      failure(OPENCLAW_REFUSAL),
      ['jeeves-meta-openclaw'],
    ],
    [
      'the refusal on stdout',
      failure('', OPENCLAW_REFUSAL),
      ['jeeves-meta-openclaw'],
    ],
    [
      'several plugins, deduplicated',
      failure(
        `${OPENCLAW_REFUSAL}\n${OPENCLAW_REFUSAL.replaceAll('jeeves-meta', 'jeeves-server')}\n${OPENCLAW_REFUSAL}`,
      ),
      ['jeeves-meta-openclaw', 'jeeves-server-openclaw'],
    ],
    [
      'the signal without an id',
      failure('plugin has not converged'),
      ['unknown plugin'],
    ],
  ])('%s', (_name, error, expected) => {
    expect(unconvergedPlugins(error)).toEqual(expected);
  });
});

describe('retryDelays', () => {
  it('doubles, caps and stays within the budget', () => {
    expect(retryDelays(DEFAULT_CONVERGENCE_RETRY)).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it('yields no delays for a zero initial delay', () => {
    expect(
      retryDelays({ initialDelayMs: 0, maxDelayMs: 10, budgetMs: 100 }),
    ).toEqual([]);
  });
});

describe('timerSleep', () => {
  it('resolves after the delay', async () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      const pending = timerSleep(1_000).then(done);
      await vi.advanceTimersByTimeAsync(999);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('withConvergenceRetry', () => {
  const harness = () => {
    const slept: number[] = [];
    const log: string[] = [];
    return {
      slept,
      log,
      options: {
        sleep: (ms: number) => {
          slept.push(ms);
          return Promise.resolve();
        },
        log: (l: string) => log.push(l),
      },
    };
  };

  it('converges after N retries', async () => {
    const h = harness();
    let calls = 0;
    await withConvergenceRetry(() => {
      calls++;
      return calls <= 2
        ? Promise.reject(failure(OPENCLAW_REFUSAL))
        : Promise.resolve();
    }, h.options);
    expect(calls).toBe(3);
    expect(h.slept).toEqual([2_000, 4_000]);
    expect(h.log).toEqual([
      'OpenClaw has not finished converging plugin(s) jeeves-meta-openclaw; retrying in 2s (retry 1/7)',
      'OpenClaw has not finished converging plugin(s) jeeves-meta-openclaw; retrying in 4s (retry 2/7)',
    ]);
  });

  it('runs beforeRetry after each refusal, before the wait', async () => {
    const h = harness();
    const order: string[] = [];
    let calls = 0;
    await withConvergenceRetry(
      () => {
        order.push('write');
        calls++;
        return calls <= 2
          ? Promise.reject(failure(OPENCLAW_REFUSAL))
          : Promise.resolve();
      },
      {
        log: h.options.log,
        sleep: (ms) => {
          order.push(`sleep ${String(ms)}`);
          return Promise.resolve();
        },
        beforeRetry: () => {
          order.push('sweep');
          return Promise.resolve();
        },
      },
    );
    expect(order).toEqual([
      'write',
      'sweep',
      'sleep 2000',
      'write',
      'sweep',
      'sleep 4000',
      'write',
    ]);
  });

  it('rethrows any other error immediately', async () => {
    const h = harness();
    const error = failure('Config validation failed');
    const action = vi.fn(() => Promise.reject(error));
    await expect(withConvergenceRetry(action, h.options)).rejects.toBe(error);
    expect(action).toHaveBeenCalledTimes(1);
    expect(h.slept).toEqual([]);
  });

  it('fails naming the plugin once the budget is spent', async () => {
    const h = harness();
    const action = vi.fn(() => Promise.reject(failure(OPENCLAW_REFUSAL)));
    await expect(
      withConvergenceRetry(action, {
        ...h.options,
        policy: { initialDelayMs: 1_000, maxDelayMs: 2_000, budgetMs: 5_000 },
      }),
    ).rejects.toThrow(
      /after 5s: plugin\(s\) jeeves-meta-openclaw have not finished converging/,
    );
    expect(h.slept).toEqual([1_000, 2_000, 2_000]);
    expect(action).toHaveBeenCalledTimes(4);
  });
});
