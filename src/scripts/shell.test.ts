/**
 * Tests for client shell utilities.
 */

import { describe, expect, it } from 'vitest';

import { run } from './shell.js';

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
