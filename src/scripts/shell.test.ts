/**
 * Tests for client shell utilities.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { run, runWithRetry } from './shell.js';

describe('run', () => {
  it('executes a command and returns stdout', () => {
    const result = run('node', ['-e', 'console.log("hello")']);
    expect(result).toBe('hello');
  });

  it('throws on non-zero exit', () => {
    expect(() => run('node', ['-e', 'process.exit(1)'])).toThrow(
      'failed (exit 1)',
    );
  });
});

describe('runWithRetry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-run-retry-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retries a failing command until it succeeds (attempt count)', () => {
    const counterFile = path.join(tmpDir, 'counter');
    fs.writeFileSync(counterFile, '0');
    const script = `
      const fs = require('fs');
      const n = Number(fs.readFileSync(${JSON.stringify(counterFile)}, 'utf8')) + 1;
      fs.writeFileSync(${JSON.stringify(counterFile)}, String(n));
      if (n < 3) { console.error('timeout'); process.exit(1); }
      console.log('ok');
    `;
    const result = runWithRetry('node', ['-e', script], {
      backoffMs: 1,
      isRetryable: () => true,
    });
    expect(result).toBe('ok');
    expect(fs.readFileSync(counterFile, 'utf8')).toBe('3');
  });

  it('throws the underlying error once retries are exhausted', () => {
    expect(() =>
      runWithRetry('node', ['-e', 'process.exit(1)'], {
        retries: 1,
        backoffMs: 1,
        isRetryable: () => true,
      }),
    ).toThrow('failed (exit 1)');
  });

  it('does not retry a non-retryable error', () => {
    const counterFile = path.join(tmpDir, 'counter');
    fs.writeFileSync(counterFile, '0');
    const script = `
      const fs = require('fs');
      const n = Number(fs.readFileSync(${JSON.stringify(counterFile)}, 'utf8')) + 1;
      fs.writeFileSync(${JSON.stringify(counterFile)}, String(n));
      process.exit(1);
    `;
    expect(() =>
      runWithRetry('node', ['-e', script], {
        backoffMs: 1,
        isRetryable: () => false,
      }),
    ).toThrow('failed (exit 1)');
    expect(fs.readFileSync(counterFile, 'utf8')).toBe('1');
  });

  /** A script that fails with `stderr` on its first run, then prints ok. */
  const failOnceWith = (counterFile: string, stderr: string): string => `
      const fs = require('fs');
      const n = Number(fs.readFileSync(${JSON.stringify(counterFile)}, 'utf8')) + 1;
      fs.writeFileSync(${JSON.stringify(counterFile)}, String(n));
      if (n < 2) { console.error(${JSON.stringify(stderr)}); process.exit(1); }
      console.log('ok');
    `;

  it.each(['context deadline exceeded', 'request timed out', 'Timeout'])(
    'by default retries a failure whose message says %j',
    (stderr) => {
      const counterFile = path.join(tmpDir, 'counter');
      fs.writeFileSync(counterFile, '0');
      expect(
        runWithRetry('node', ['-e', failOnceWith(counterFile, stderr)], {
          backoffMs: 1,
        }),
      ).toBe('ok');
      expect(fs.readFileSync(counterFile, 'utf8')).toBe('2');
    },
  );

  it('by default does not retry other failures', () => {
    const counterFile = path.join(tmpDir, 'counter');
    fs.writeFileSync(counterFile, '0');
    expect(() =>
      runWithRetry(
        'node',
        ['-e', failOnceWith(counterFile, 'permission denied')],
        {
          backoffMs: 1,
        },
      ),
    ).toThrow('failed (exit 1)');
    expect(fs.readFileSync(counterFile, 'utf8')).toBe('1');
  });

  it('waits with exponential backoff between attempts', () => {
    const counterFile = path.join(tmpDir, 'counter');
    const timestampsFile = path.join(tmpDir, 'timestamps');
    fs.writeFileSync(counterFile, '0');
    fs.writeFileSync(timestampsFile, '');
    const script = `
      const fs = require('fs');
      const n = Number(fs.readFileSync(${JSON.stringify(counterFile)}, 'utf8')) + 1;
      fs.writeFileSync(${JSON.stringify(counterFile)}, String(n));
      fs.appendFileSync(${JSON.stringify(timestampsFile)}, Date.now() + '\\n');
      if (n < 3) { console.error('timeout'); process.exit(1); }
      console.log('ok');
    `;
    runWithRetry('node', ['-e', script], {
      backoffMs: 400,
      isRetryable: () => true,
    });
    const timestamps = fs
      .readFileSync(timestampsFile, 'utf8')
      .trim()
      .split('\n')
      .map(Number);
    expect(timestamps).toHaveLength(3);
    const gap1 = timestamps[1] - timestamps[0];
    const gap2 = timestamps[2] - timestamps[1];
    // First gap ~= backoffMs (400ms), second gap ~= 2x backoffMs (800ms).
    // Use loose bounds tolerant of node spawn overhead jitter: the key
    // invariant is that the second wait is clearly longer than the first.
    expect(gap1).toBeGreaterThanOrEqual(300);
    expect(gap2).toBeGreaterThan(gap1);
    expect(gap2).toBeGreaterThanOrEqual(600);
  });
});
