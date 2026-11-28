/**
 * MCP tool definitions built and checked once (spec 0.12.0 §5.2, Decisions
 * 94, 97).
 *
 * @module
 */

import { fromJsonSchema } from '@modelcontextprotocol/server';

import {
  type CatalogToolAnnotations,
  catalogToolDefinition,
} from '../catalog/catalogTool.js';
import type { CatalogEntry } from '../catalog/types.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../plugin/http.js';
import type { CatalogMcpContent, McpToolSettings } from './catalogMcpServer.js';

/** A tool definition built once, at preparation. */
export interface PreparedTool {
  entry: CatalogEntry;
  settings: McpToolSettings;
  name: string;
  description: string;
  inputSchema: ReturnType<typeof fromJsonSchema<Record<string, unknown>>>;
  annotations: CatalogToolAnnotations;
  timeoutMs: number;
}

/**
 * The published input schema: fixed parameters removed altogether, and
 * defaulted ones no longer required (the SDK checks arguments before the
 * call fills them in).
 *
 * @param schema - Tool input schema.
 * @param defaulted - Parameters with defaults.
 * @param fixed - Fixed parameters.
 * @returns The schema.
 */
function publishedSchema(
  schema: Record<string, unknown>,
  defaulted: string[],
  fixed: string[],
): Record<string, unknown> {
  const { required, properties, ...rest } = schema;
  const out: Record<string, unknown> = { ...rest };
  if (properties && typeof properties === 'object')
    out.properties = Object.fromEntries(
      Object.entries(properties).filter(([name]) => !fixed.includes(name)),
    );
  if (Array.isArray(required)) {
    const left = required.filter(
      (name: unknown) =>
        typeof name !== 'string' ||
        (!defaulted.includes(name) && !fixed.includes(name)),
    );
    if (left.length > 0) out.required = left;
  }
  return out;
}

/**
 * Check a tool's `defaults` and `fixed` against its parameters.
 *
 * @param entry - The tool's entry.
 * @param parameters - The tool's parameter names.
 * @param settings - Its settings.
 * @throws Error for a `fixed` key that names no parameter, or a parameter
 *   in both `defaults` and `fixed`.
 */
function checkPresets(
  entry: CatalogEntry,
  parameters: string[],
  settings: McpToolSettings,
): void {
  const at = `MCP tool for entry "${entry.name}"`;
  for (const name of Object.keys(settings.fixed ?? {})) {
    if (!parameters.includes(name))
      throw new Error(`${at}: fixed parameter "${name}" is not a parameter`);
    if (settings.defaults && name in settings.defaults)
      throw new Error(`${at}: "${name}" is in both defaults and fixed`);
  }
}

/**
 * Build and check every selected tool's definition.
 *
 * @param content - What the server serves.
 * @returns The prepared tools, in catalog order.
 * @throws Error for an unknown entry, a duplicate tool name, an invalid or
 *   colliding alias, an entry with a binary request body, a `fixed` key that
 *   names no parameter, or a parameter in both `defaults` and `fixed`.
 */
export function prepareTools(content: CatalogMcpContent): PreparedTool[] {
  const selection = content.tools;
  const known = new Set(content.catalog.entries.map((e) => e.name));
  for (const name of Object.keys(selection))
    if (!known.has(name))
      throw new Error(`MCP tools: unknown catalog entry "${name}"`);

  const tools: PreparedTool[] = [];
  const names = new Set<string>();
  for (const entry of content.catalog.entries) {
    const selected = selection[entry.name];
    if (selected === undefined) continue;
    const settings = selected === true ? {} : selected;
    const definition = catalogToolDefinition(entry, {
      prefix: content.prefix,
      ...(settings.inputAliases ? { inputAliases: settings.inputAliases } : {}),
    });
    if (names.has(definition.name))
      throw new Error(`MCP tools: duplicate tool name "${definition.name}"`);
    names.add(definition.name);
    const properties = definition.inputSchema.properties;
    checkPresets(
      entry,
      properties && typeof properties === 'object'
        ? Object.keys(properties)
        : [],
      settings,
    );
    tools.push({
      entry,
      settings,
      name: definition.name,
      description: definition.description,
      inputSchema: fromJsonSchema<Record<string, unknown>>(
        publishedSchema(
          definition.inputSchema,
          Object.keys(settings.defaults ?? {}),
          Object.keys(settings.fixed ?? {}),
        ),
      ),
      annotations: definition.annotations,
      timeoutMs:
        settings.timeoutMs ?? content.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    });
  }
  return tools;
}
