/**
 * Committed OpenAPI document: writer and drift check (spec 5.6).
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Catalog } from '../catalog/types.js';
import {
  buildOpenApiDocument,
  type OpenApiInfo,
} from './buildOpenApiDocument.js';

/** Most differing lines a drift report lists. */
const MAX_DIFF_LINES = 20;

/**
 * Serialise a catalog's document: 2-space JSON with a trailing newline.
 *
 * @param catalog - The catalog.
 * @param info - Document `info`.
 * @returns The file content.
 */
function render(catalog: Catalog, info: OpenApiInfo): string {
  return JSON.stringify(buildOpenApiDocument(catalog, info), null, 2) + '\n';
}

/**
 * Write a catalog's OpenAPI document to a file (normally the committed
 * `openapi.json` in a component's `core` package).
 *
 * @param catalog - The catalog.
 * @param info - Document `info`.
 * @param file - Output path.
 */
export function writeOpenApiDocument(
  catalog: Catalog,
  info: OpenApiInfo,
  file: string,
): void {
  writeFileSync(file, render(catalog, info));
}

/** Result of {@link checkOpenApiDrift}. */
export interface OpenApiDriftResult {
  /** True when the file equals the generated document. */
  ok: boolean;
  /** When not ok: the differing lines (`-` file, `+` generated). */
  diff?: string;
}

/**
 * Compare a committed OpenAPI document with the one the catalog generates.
 *
 * @remarks
 * Line endings are normalised, so a CRLF checkout doesn't count as drift.
 * A missing file is drift.
 *
 * @param catalog - The catalog.
 * @param info - Document `info`.
 * @param file - The committed document.
 * @returns `{ ok }`, with a `diff` of the first differing lines when not ok.
 */
export function checkOpenApiDrift(
  catalog: Catalog,
  info: OpenApiInfo,
  file: string,
): OpenApiDriftResult {
  const generated = render(catalog, info);
  if (!existsSync(file))
    return { ok: false, diff: `${file} does not exist; run the writer.` };
  const committed = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (committed === generated) return { ok: true };
  const a = committed.split('\n');
  const b = generated.split('\n');
  const lines: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const was = a.at(i);
    const now = b.at(i);
    if (was === now) continue;
    lines.push(`@@ line ${String(i + 1)}`);
    if (was !== undefined) lines.push(`- ${was}`);
    if (now !== undefined) lines.push(`+ ${now}`);
    if (lines.length >= MAX_DIFF_LINES * 3) break;
  }
  return { ok: false, diff: lines.join('\n') };
}
