import { describe, expect, it } from 'vitest';

import { resolveWorkspacePath as canonical } from '../plugin/resolve.js';
import { resolveWorkspacePath as reExported } from './resolveWorkspacePath.js';

describe('resolveWorkspacePath re-export', () => {
  it('re-exports the canonical function from plugin/resolve', () => {
    expect(reExported).toBe(canonical);
  });
});
