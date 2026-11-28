/**
 * Map a route response to an MCP tool result (spec 0.12.0 §5.2 Results).
 *
 * @remarks
 * Internal to `/mcp`. JSON, text and non-2xx responses map as plugin tools
 * map them (`toolResultFromResponse`, unchanged).
 *
 * @module
 */

import type { CallToolResult } from '@modelcontextprotocol/server';

import { toolResultFromResponse } from '../catalog/catalogTool.js';
import type { CatalogResponse } from '../catalog/httpTransport.js';
import type { CatalogEntry } from '../catalog/types.js';
import type { ToolResult } from '../plugin/types.js';

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
 * Map a response to an MCP tool result.
 *
 * @param entry - The tool's catalog entry.
 * @param res - The route's response.
 * @returns The MCP tool result.
 */
export async function mcpResultFromResponse(
  entry: CatalogEntry,
  res: CatalogResponse,
): Promise<CallToolResult> {
  return toCallToolResult(await toolResultFromResponse(entry, res));
}
