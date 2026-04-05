import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPackageRoot } from './getPackageRoot.js';

describe('getPackageRoot', () => {
  it('returns the correct package root for this package', () => {
    const pkgRoot = getPackageRoot(import.meta.url);
    expect(pkgRoot).toBeDefined();

    const pkg = JSON.parse(
      readFileSync(join(pkgRoot!, 'package.json'), 'utf-8'),
    ) as { name: string };

    expect(pkg.name).toBe('@karmaniverous/jeeves');
  });

  it('returns undefined for an invalid URL', () => {
    const result = getPackageRoot('file:///nonexistent/path/foo.ts');
    expect(result).toBeUndefined();
  });
});
