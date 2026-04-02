/**
 * Tests for run-script crash handler wrapper.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runScript } from './run-script.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-runscript-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runScript', () => {
  it('executes a sync function successfully', () => {
    let called = false;
    // Mock process.exit so it doesn't kill the test runner
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    runScript(
      'test-sync',
      () => {
        called = true;
      },
      tmpDir,
    );
    expect(called).toBe(true);
    // No crash log should exist
    expect(fs.existsSync(path.join(tmpDir, '_crash.log'))).toBe(false);
  });

  it('writes crash log on sync error', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runScript(
      'test-crash',
      () => {
        throw new Error('boom');
      },
      tmpDir,
    );

    const crashLog = fs.readFileSync(path.join(tmpDir, '_crash.log'), 'utf-8');
    expect(crashLog).toContain('CRASH (test-crash)');
    expect(crashLog).toContain('boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes crash log on async error', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runScript(
      'test-async-crash',
      () =>
        new Promise<void>((_, reject) => {
          reject(new Error('async boom'));
        }),
      tmpDir,
    );

    // Give the async rejection handler a tick to fire
    await new Promise((r) => setTimeout(r, 50));

    const crashLog = fs.readFileSync(path.join(tmpDir, '_crash.log'), 'utf-8');
    expect(crashLog).toContain('CRASH (test-async-crash)');
    expect(crashLog).toContain('async boom');
  });
});
