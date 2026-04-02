import { describe, expect, it, vi } from 'vitest';

import { checkNodeVersion } from './checkNodeVersion.js';

describe('checkNodeVersion', () => {
  it('does not exit when Node version meets minimum', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    // Current test runner is Node >= 22, so this should pass
    checkNodeVersion();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('exits with code 1 when Node version is too low', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    // Mock a low Node version
    const original = process.versions.node;
    Object.defineProperty(process.versions, 'node', {
      value: '20.0.0',
      writable: true,
      configurable: true,
    });

    checkNodeVersion();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('requires Node.js >= 22'),
    );

    // Restore
    Object.defineProperty(process.versions, 'node', {
      value: original,
      writable: true,
      configurable: true,
    });
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
