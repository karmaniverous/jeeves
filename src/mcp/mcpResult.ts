/**
 * Map a route response to an MCP tool result (spec 0.12.0 §5.2 Results,
 * Decision 98, #175).
 *
 * @remarks
 * Internal to `/mcp`. JSON, text and non-2xx responses map as plugin tools
 * map them (`toolResultFromResponse`, unchanged), so plugin tools keep
 * treating binary as an error. On MCP, PNG, JPEG, GIF and WebP become
 * `image` results up to a size limit, and SVG becomes text. Mapping follows
 * the entry's declared `contentType`; a declared media range (`image/*`)
 * means "read the response's `Content-Type`". Media types compare
 * case-insensitively on type and subtype; parameters are ignored.
 *
 * @module
 */

import type { CallToolResult } from '@modelcontextprotocol/server';

import { toolResultFromResponse } from '../catalog/catalogTool.js';
import type { CatalogResponse } from '../catalog/httpTransport.js';
import {
  isJsonContentType,
  isMediaRange,
  isTextContentType,
  mediaTypeOf,
} from '../catalog/schemaHelpers.js';
import type { CatalogEntry } from '../catalog/types.js';
import { fail } from '../plugin/results.js';
import type { ToolResult } from '../plugin/types.js';

/** Default largest image result, in decoded bytes: 5 MiB. */
export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Image types MCP clients display. */
const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

const SVG = 'image/svg+xml';

/**
 * A jeeves tool result as an MCP one (text blocks; `isError` always set).
 *
 * @param result - `ok`/`fail`/`toolResultFromResponse` result.
 * @returns The MCP tool result.
 */
export const toCallToolResult = (result: ToolResult): CallToolResult => ({
  content: result.content.map(({ text }) => ({ type: 'text', text })),
  isError: result.isError === true,
});

/**
 * An MCP error result, worded as plugin tool errors are.
 *
 * @param text - The message.
 * @returns The result.
 */
const errorResult = (text: string): CallToolResult =>
  toCallToolResult(fail(text));

/**
 * A bare, lower-cased media type (`type/subtype`).
 *
 * @param contentType - A content type.
 * @returns Its bare form.
 */
function bare(contentType: string): string {
  const { type, subtype } = mediaTypeOf(contentType);
  return `${type}/${subtype}`;
}

/**
 * The bytes as an image result, or an error result when over the limit.
 *
 * @param res - The response.
 * @param mimeType - Its bare image type.
 * @param maxImageBytes - Largest image, in decoded bytes.
 * @returns The result.
 */
async function imageResult(
  res: CatalogResponse,
  mimeType: string,
  maxImageBytes: number,
): Promise<CallToolResult> {
  const bytes = await res.bytes();
  if (bytes.length > maxImageBytes)
    return errorResult(
      `Image of ${String(bytes.length)} bytes exceeds the limit of ${String(maxImageBytes)} bytes`,
    );
  return {
    content: [
      { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType },
    ],
    isError: false,
  };
}

/**
 * Map a response to an MCP tool result.
 *
 * @param entry - The tool's catalog entry.
 * @param res - The route's response.
 * @param maxImageBytes - Largest image result, in decoded bytes.
 * @returns The MCP tool result.
 */
export async function mcpResultFromResponse(
  entry: CatalogEntry,
  res: CatalogResponse,
  maxImageBytes: number,
): Promise<CallToolResult> {
  const declared = entry.contentType;
  const deferred = async () =>
    toCallToolResult(await toolResultFromResponse(entry, res));
  if (
    res.status >= 300 ||
    isJsonContentType(declared) ||
    isTextContentType(declared as string)
  )
    return deferred();

  const declaredBare = bare(declared as string);
  let type = declaredBare;
  if (isMediaRange(declaredBare)) {
    if (!declaredBare.startsWith('image/')) return deferred();
    type = bare(res.headers.get('content-type') ?? '');
    if (!IMAGE_TYPES.has(type) && type !== SVG)
      return errorResult(
        `Unsupported image type "${type}" for an image/* tool result`,
      );
  }
  if (IMAGE_TYPES.has(type)) return imageResult(res, type, maxImageBytes);
  if (type === SVG)
    return {
      content: [{ type: 'text', text: await res.text() }],
      isError: false,
    };
  return deferred();
}
