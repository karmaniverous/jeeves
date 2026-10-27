/**
 * The shared catalog tool definition and tool result mapping (spec 5.7).
 *
 * @remarks
 * Plugin tools use these now; MCP tools reuse them (#136). Plugin-only
 * settings such as `catalogMode` are added by the toolset, not here.
 *
 * @module
 */

import { z } from 'zod';

import { fail, ok } from '../plugin/results.js';
import type { ToolResult } from '../plugin/types.js';
import {
  buildCatalogRequest,
  type CatalogRequest,
  mergedInputSchema,
} from './buildCatalogRequest.js';
import { CatalogClientError } from './clientError.js';
import type { CatalogResponse } from './httpTransport.js';
import { isJsonContentType, isTextContentType } from './schemaHelpers.js';
import type { CatalogEntry, EntryKind } from './types.js';

/** Tool names agents accept. */
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Tool name for an entry: `prefix_snake_case_name`.
 *
 * @param prefix - Tool prefix (normally the component name).
 * @param name - camelCase entry name.
 * @returns The tool name.
 * @throws Error when the result isn't 1-64 characters of `[a-zA-Z0-9_-]`.
 */
export function toToolName(prefix: string, name: string): string {
  const tool = `${prefix}_${name.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
  if (!TOOL_NAME.test(tool))
    throw new Error(
      `Tool name "${tool}" must match ${String(TOOL_NAME)} (1-64 characters of letters, digits, _ or -)`,
    );
  return tool;
}

/** Tool behaviour hints derived from an entry's `kind`. */
export interface CatalogToolAnnotations {
  /** Set for `read` entries. */
  readOnlyHint?: true;
  /** Set for `destructive` entries. */
  destructiveHint?: true;
}

/** A tool definition built from a catalog entry. */
export interface CatalogToolDefinition {
  /** Tool name. */
  name: string;
  /** Tool description. */
  description: string;
  /** JSON Schema of the tool parameters. */
  inputSchema: Record<string, unknown>;
  /** Behaviour hints. */
  annotations: CatalogToolAnnotations;
}

/** Options for {@link catalogToolDefinition}. */
export interface CatalogToolOptions {
  /** Tool name prefix (normally the component name). */
  prefix: string;
  /** Description override; default the entry's. */
  description?: string;
  /**
   * Tool parameter names for entry fields, keyed by entry field: e.g.
   * `{ patch: 'config' }` exposes `patch` as `config`. A `'*'` path
   * parameter needs one, since `*` isn't a usable parameter name.
   */
  inputAliases?: Readonly<Record<string, string>>;
}

/**
 * Annotations for an entry kind.
 *
 * @param kind - Entry kind.
 * @returns `readOnlyHint` for `read`, `destructiveHint` for `destructive`,
 *   none for `write`.
 */
function annotationsOf(kind: EntryKind): CatalogToolAnnotations {
  if (kind === 'read') return { readOnlyHint: true };
  if (kind === 'destructive') return { destructiveHint: true };
  return {};
}

/**
 * Check aliases against an entry's fields.
 *
 * @param entry - Catalog entry.
 * @param fields - The entry's request field names.
 * @param aliases - Entry field to tool parameter name.
 * @throws Error for a `'*'` field without an alias, an alias of an unknown
 *   field, or an alias that collides with another field or alias.
 */
function checkAliases(
  entry: CatalogEntry,
  fields: string[],
  aliases: Readonly<Record<string, string>>,
): void {
  const at = `Tool for entry "${entry.name}"`;
  if (fields.includes('*') && !aliases['*'])
    throw new Error(`${at}: the '*' path parameter requires an input alias`);
  const names = new Set(fields.filter((f) => !(f in aliases)));
  for (const [field, alias] of Object.entries(aliases)) {
    if (!fields.includes(field))
      throw new Error(`${at}: input alias for unknown field "${field}"`);
    if (names.has(alias))
      throw new Error(`${at}: input alias "${alias}" collides with a field`);
    names.add(alias);
  }
}

/**
 * Build the tool definition for an entry.
 *
 * @remarks
 * The input schema is the merged `params`/`query`/`body` object converted in
 * output mode (the parsed shape tools pass), with aliased fields renamed and
 * `$schema` removed.
 *
 * @param entry - Catalog entry.
 * @param options - Prefix, description override and input aliases.
 * @returns The definition.
 * @throws Error for an invalid tool name or invalid aliases.
 */
export function catalogToolDefinition(
  entry: CatalogEntry,
  options: CatalogToolOptions,
): CatalogToolDefinition {
  const aliases = options.inputAliases ?? {};
  const merged = mergedInputSchema(entry);
  checkAliases(entry, Object.keys(merged.shape), aliases);

  const schema = z.toJSONSchema(merged, { io: 'output' }) as {
    $schema?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  } & Record<string, unknown>;
  const rename = (field: string) => aliases[field] ?? field;
  const inputSchema: Record<string, unknown> = { ...schema };
  delete inputSchema.$schema;
  if (schema.properties)
    inputSchema.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [rename(k), v]),
    );
  if (schema.required) inputSchema.required = schema.required.map(rename);

  return {
    name: toToolName(options.prefix, entry.name),
    description: options.description ?? entry.description,
    inputSchema,
    annotations: annotationsOf(entry.kind),
  };
}

/**
 * Turn tool parameters into a request: map aliased parameters back to their
 * entry fields, encode parsed values to their wire form (e.g. a boolean for a
 * `z.stringbool()` query field becomes `'true'`), then build the request.
 *
 * @param entry - Catalog entry.
 * @param params - Tool parameters (the parsed shape).
 * @param inputAliases - Entry field to tool parameter name, as given to
 *   {@link catalogToolDefinition}.
 * @returns The request.
 * @throws {@link CatalogClientError} with status 0 and the Zod issues for
 *   invalid parameters.
 */
export function toolInputToRequest(
  entry: CatalogEntry,
  params: Record<string, unknown>,
  inputAliases: Readonly<Record<string, string>> = {},
): CatalogRequest {
  const fieldOf = new Map(
    Object.entries(inputAliases).map(([field, alias]) => [alias, field]),
  );
  const input = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      fieldOf.get(key) ?? key,
      value,
    ]),
  );
  const encoded = z.safeEncode(mergedInputSchema(entry), input);
  if (!encoded.success)
    throw new CatalogClientError(`Invalid input for "${entry.name}"`, {
      status: 0,
      issues: encoded.error.issues,
    });
  return buildCatalogRequest(entry, encoded.data as never);
}

/**
 * Map a response to a tool result, matching the 0.7.0 tools: 2xx JSON is
 * `ok(data)`, 2xx `text/*` is `ok(text)`, other 2xx bytes fail, and a non-2xx
 * status fails with `HTTP <status>: <body text>`.
 *
 * @param entry - Catalog entry.
 * @param res - Transport response.
 * @returns The tool result.
 */
export async function toolResultFromResponse(
  entry: CatalogEntry,
  res: CatalogResponse,
): Promise<ToolResult> {
  if (res.status >= 300)
    return fail(`HTTP ${String(res.status)}: ${await res.text()}`);
  if (isJsonContentType(entry.contentType)) return ok(await res.json());
  if (isTextContentType(entry.contentType as string))
    return ok(await res.text());
  return fail('Binary response is not supported as a tool result');
}
