/**
 * 0.7.0 baseline for the root export surface (spec §5, dev-plan step 0).
 *
 * @remarks
 * Records every runtime export of the root entry point and its kind, from
 * untouched 0.7.0 code. New catalog runtime code ships in sub-path entry
 * points (spec 5.1); the root's only runtime additions are the three
 * jeeves-server link keys (#149, Lock Log 2026-10-29). Without those three
 * the list must stay exactly equal. Type-level compatibility is checked separately by
 * `typeCompat.baseline.test.ts`, generated from `api-0.7.0.d.ts` (the 0.7.0
 * built declarations, kept verbatim beside this test). Never regenerate the
 * snapshot with `vitest -u`.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import * as root from '../../index.js';

/** Runtime exports 0.8.0 adds to the root (#149). */
const ADDED_IN_080 = [
  'computeInsiderKey',
  'computeOutsiderKeyWithExpiry',
  'computePathKey',
];

describe('0.7.0 baseline: root export surface', () => {
  it('runtime exports and their kinds', async () => {
    const surface = Object.fromEntries(
      Object.keys(root)
        .filter((name) => !ADDED_IN_080.includes(name))
        .sort()
        .map((name) => [name, typeof (root as Record<string, unknown>)[name]]),
    );
    await expect(JSON.stringify(surface, null, 2) + '\n').toMatchFileSnapshot(
      './exports.json',
    );
  });

  it('adds only the #149 link-key functions', () => {
    for (const name of ADDED_IN_080)
      expect(typeof (root as Record<string, unknown>)[name]).toBe('function');
  });
});
