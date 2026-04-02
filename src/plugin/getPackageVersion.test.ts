import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';
import { describe, expect, it } from 'vitest';

import { getPackageVersion } from './getPackageVersion.js';

describe('getPackageVersion', () => {
  it('returns the correct version for this package', () => {
    const pkgRoot = packageDirectorySync({
      cwd: fileURLToPath(import.meta.url),
    });
    const pkg = JSON.parse(
      readFileSync(join(pkgRoot!, 'package.json'), 'utf-8'),
    ) as { version: string };
    const expected = pkg.version;

    const result = getPackageVersion(import.meta.url);
    expect(result).toBe(expected);
  });

  it('returns unknown for an invalid URL', () => {
    const result = getPackageVersion('file:///nonexistent/path/foo.ts');
    expect(result).toBe('unknown');
  });
});
