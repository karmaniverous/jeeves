/**
 * 0.7.0 baseline for the root export surface (spec §5, dev-plan step 0).
 *
 * @remarks
 * Records every runtime export of the root entry point and its kind, from
 * untouched 0.7.0 code. 0.8.0 adds no runtime export to the root entry point
 * (new runtime code ships in sub-path entry points, spec 5.1), so the list
 * must stay exactly equal. Type-level compatibility is checked separately by
 * `typeCompat.baseline.test.ts`, generated from `api-0.7.0.d.ts` (the 0.7.0
 * built declarations, kept verbatim beside this test). Never regenerate the
 * snapshot with `vitest -u`.
 *
 * @module
 */

import { describe, expect, it } from 'vitest';

import * as root from '../../index.js';

describe('0.7.0 baseline: root export surface', () => {
  it('runtime exports and their kinds', async () => {
    const surface = Object.fromEntries(
      Object.keys(root)
        .sort()
        .map((name) => [name, typeof (root as Record<string, unknown>)[name]]),
    );
    await expect(JSON.stringify(surface, null, 2) + '\n').toMatchFileSnapshot(
      './exports.json',
    );
  });
});
