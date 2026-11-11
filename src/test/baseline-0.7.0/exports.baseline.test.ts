/**
 * 0.7.0 baseline for the root export surface (spec §5, dev-plan step 0).
 *
 * @remarks
 * Records every runtime export of the root entry point and its kind, from
 * untouched 0.7.0 code. New catalog runtime code ships in sub-path entry
 * points (spec 5.1); the root's only runtime additions are the three
 * jeeves-server link keys (#149) and the parser's unknownArgs and
 * valuelessArgs (#151), Lock Log 2026-10-29, and 0.10.0's error-body builder
 * and codes (#164, spec 5c), plus config apply's read and write failure
 * codes (#167, spec 5d.2). Without those the list must stay exactly
 * equal. Type-level compatibility is checked separately by
 * `typeCompat.baseline.test.ts`, generated from `api-0.7.0.d.ts` (the 0.7.0
 * built declarations, kept verbatim beside this test). Never regenerate the
 * snapshot with `vitest -u`.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import * as root from '../../index.js';

/** Runtime exports 0.8.0 adds to the root (#149, #151). */
const ADDED_IN_080 = [
  'computeInsiderKey',
  'computeOutsiderKeyWithExpiry',
  'computePathKey',
  'unknownArgs',
  'valuelessArgs',
];

/** Runtime exports 0.10.0 (#164) and the #167 change add to the root: name to kind. */
const ADDED_IN_0100 = {
  errorBody: 'function',
  JEEVES_CONFIG_INVALID: 'string',
  JEEVES_CONFIG_QUERY_INVALID: 'string',
  JEEVES_RESPONSE_VALIDATION: 'string',
  SERVER_ERROR_MESSAGE: 'string',
  // The #167 change (spec 5d.2).
  JEEVES_CONFIG_READ_FAILED: 'string',
  JEEVES_CONFIG_WRITE_FAILED: 'string',
} as const;

describe('0.7.0 baseline: root export surface', () => {
  it('runtime exports and their kinds', async () => {
    const surface = Object.fromEntries(
      Object.keys(root)
        .filter((name) => !ADDED_IN_080.includes(name))
        .filter((name) => !(name in ADDED_IN_0100))
        .sort()
        .map((name) => [name, typeof (root as Record<string, unknown>)[name]]),
    );
    await expect(JSON.stringify(surface, null, 2) + '\n').toMatchFileSnapshot(
      './exports.json',
    );
  });

  it('adds only the #149 link-key and #151 parser functions', () => {
    for (const name of ADDED_IN_080)
      expect(typeof (root as Record<string, unknown>)[name]).toBe('function');
  });

  it('adds the #164 error-body builder and codes, and the #167 codes', () => {
    for (const [name, kind] of Object.entries(ADDED_IN_0100))
      expect(typeof (root as Record<string, unknown>)[name]).toBe(kind);
  });
});
