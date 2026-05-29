import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetInit } from '../../init.js';
import { initFromOptions } from './cliDefaults.js';

describe('initFromOptions', () => {
  afterEach(() => {
    resetInit();
    vi.restoreAllMocks();
  });

  it('should reject a Windows drive-letter configRoot before resolve() on non-Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    // On Linux, resolve('j:/config') → '/cwd/j:/config' which masks the
    // drive-letter pattern. The pre-resolution check in initFromOptions must
    // catch it before resolve() runs.
    expect(() => {
      initFromOptions({ configRoot: 'j:/config' });
    }).toThrow(/Windows.*drive.letter/i);
  });

  it('should reject a Windows drive-letter workspace before resolve() on non-Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

    expect(() => {
      initFromOptions({ workspace: 'D:/workspace' });
    }).toThrow(/Windows.*drive.letter/i);
  });
});
