/**
 * Regression guard for the release pipeline's version inlining (#110).
 *
 * @remarks
 * `CORE_VERSION` is inlined from `package.json` at build time. release-it
 * bumps `package.json` between `after:init` and `after:bump`, so the
 * release build must run in `after:bump` (before `npm publish`); building
 * in `after:init` publishes a dist stamped with the previous version.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const hooksSchema = z.object({
  'release-it': z.object({
    hooks: z.record(z.string(), z.array(z.string())),
  }),
});

const { hooks } = hooksSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
  ),
)['release-it'];

const BUILD = 'npm run build';

describe('release-it hooks', () => {
  it('builds after the version bump so dist inlines the published version', () => {
    expect(hooks['after:bump']).toContain(BUILD);
  });

  it('does not build in any hook that runs before the version bump', () => {
    for (const hook of ['before:init', 'after:init', 'before:bump']) {
      expect(hooks[hook] ?? []).not.toContain(BUILD);
    }
  });
});
