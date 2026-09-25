import { describe, expect, it } from 'vitest';

import { generatePluginKey, REDACTED, redactSecrets } from './secrets.js';

describe('generatePluginKey', () => {
  it('returns 64 random hex characters', () => {
    const a = generatePluginKey();
    const b = generatePluginKey();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe('redactSecrets', () => {
  it('replaces every occurrence of every secret', () => {
    expect(redactSecrets('k=abc; again abc; x=def', ['abc', 'def'])).toBe(
      `k=${REDACTED}; again ${REDACTED}; x=${REDACTED}`,
    );
  });

  it('ignores empty secrets and no secrets', () => {
    expect(redactSecrets('plain', [''])).toBe('plain');
    expect(redactSecrets('plain')).toBe('plain');
  });
});
