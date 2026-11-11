/**
 * One-line rendering of Zod issues (spec 5.4, 5c.1).
 *
 * @module
 */

import type { z } from 'zod';

/**
 * Each issue's field and reason on one line, e.g.
 * `a.b: Expected number; (input): Required`.
 *
 * @param issues - Zod issues.
 * @returns The issues joined with `; `.
 */
export function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((i) => `${i.path.map(String).join('.') || '(input)'}: ${i.message}`)
    .join('; ');
}
