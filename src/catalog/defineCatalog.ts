/**
 * Catalog definition (spec 5.2).
 *
 * @module
 */

import { checkEntry, checkUniqueness } from './catalogRules.js';
import type { Catalog, CatalogEntry } from './types.js';

/** Thrown by {@link defineCatalog} when entries break the catalog rules. */
export class CatalogDefinitionError extends Error {
  /** Every violation found, one message each, naming the entry. */
  readonly violations: readonly string[];

  /**
   * @param violations - Violation messages.
   */
  constructor(violations: readonly string[]) {
    super(
      `Invalid endpoint catalog (${String(violations.length)} violation${violations.length === 1 ? '' : 's'}):\n` +
        violations.map((v) => `- ${v}`).join('\n'),
    );
    this.name = 'CatalogDefinitionError';
    this.violations = violations;
  }
}

/**
 * Validate entries against the catalog rules and freeze them into a catalog.
 *
 * @remarks
 * Rules (spec 5.2): camelCase unique names; unique method + path pairs;
 * `params`, `query` and `body` are Zod objects with no field in more than one
 * of them; `params` keys equal the path's parameters; query fields accept
 * string input; request schemas convert to JSON Schema in both input and
 * output modes and JSON responses in output mode; non-JSON responses are
 * bytes or text. Every violation is reported at once.
 *
 * @param entries - Catalog entries. Literal names and schema types are kept.
 * @returns The frozen catalog.
 * @throws {@link CatalogDefinitionError} listing every violation.
 */
export function defineCatalog<const E extends readonly CatalogEntry[]>(
  entries: E,
): Catalog<E> {
  const violations = [
    ...checkUniqueness(entries),
    ...entries.flatMap(checkEntry),
  ];
  if (violations.length > 0) throw new CatalogDefinitionError(violations);

  const frozen = Object.freeze([...entries]) as unknown as E;
  const byName = new Map(frozen.map((entry) => [entry.name, entry]));
  return Object.freeze({
    entries: frozen,
    byName: ((name: string) => {
      const entry = byName.get(name);
      if (!entry) throw new Error(`No catalog entry named "${name}"`);
      return entry;
    }) as Catalog<E>['byName'],
  });
}
