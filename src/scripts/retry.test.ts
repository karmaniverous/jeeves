import { describe, expect, it, vi } from 'vitest';

import { exponentialBackoff, retryAsync, retrySync } from './retry.js';

describe('retryAsync', () => {
  it('retries retryable failures with the policy delays, then succeeds', async () => {
    const sleeps: number[] = [];
    const onRetry = vi.fn();
    let n = 0;
    const result = await retryAsync(
      (attempt) => {
        n = attempt;
        return attempt < 3
          ? Promise.reject(new Error('timeout'))
          : Promise.resolve('ok');
      },
      {
        attempts: 3,
        delayMs: exponentialBackoff(100),
        isRetryable: (e) => String(e).includes('timeout'),
        onRetry,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      },
    );
    expect(result).toBe('ok');
    expect(n).toBe(3);
    expect(sleeps).toEqual([100, 200]);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 100);
  });

  it('rethrows a non-retryable error at once and the last error when attempts run out', async () => {
    const fatal = vi.fn(() => Promise.reject(new Error('fatal')));
    await expect(
      retryAsync(fatal, { attempts: 5, isRetryable: () => false }),
    ).rejects.toThrow('fatal');
    expect(fatal).toHaveBeenCalledTimes(1);
    const flaky = vi.fn((a: number) =>
      Promise.reject(new Error(`try ${String(a)}`)),
    );
    await expect(retryAsync(flaky, { attempts: 2 })).rejects.toThrow('try 2');
  });

  it('waits with the shared sleep when none is given', async () => {
    let n = 0;
    await expect(
      retryAsync(
        () => (n++ === 0 ? Promise.reject(new Error('x')) : Promise.resolve(1)),
        {
          attempts: 2,
          delayMs: () => 1,
        },
      ),
    ).resolves.toBe(1);
  });
});

describe('retrySync', () => {
  it('retries synchronously and rethrows the last error', () => {
    const sleeps: number[] = [];
    let n = 0;
    expect(
      retrySync(
        () => {
          if (++n < 2) throw new Error('busy');
          return n;
        },
        { attempts: 3, delayMs: () => 5, sleep: (ms) => sleeps.push(ms) },
      ),
    ).toBe(2);
    expect(sleeps).toEqual([5]);
    expect(() =>
      retrySync(
        () => {
          throw new Error('always');
        },
        { attempts: 2, sleep: () => undefined },
      ),
    ).toThrow('always');
  });
});
