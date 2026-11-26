/**
 * An MCP server over an endpoint catalog (#136).
 *
 * @remarks
 * One tool per selected entry, from the shared tool definition (spec 5.7):
 * name, the entry's description, input schema and hints from `kind`. Each
 * call is built with `toolInputToRequest`, sent through a
 * {@link CatalogTransport} and mapped with `toolResultFromResponse`, as
 * plugin tools are. The rules are the server `instructions`; the skill is a
 * resource. The SDK validates arguments against the tool's JSON Schema
 * first; `toolInputToRequest` then parses them with the entry's own schemas.
 *
 * @module
 */

import {
  type CallToolResult,
  fromJsonSchema,
  McpServer,
} from '@modelcontextprotocol/server';

import {
  catalogToolDefinition,
  toolInputToRequest,
  toolResultFromResponse,
} from '../catalog/catalogTool.js';
import type { CatalogTransport } from '../catalog/httpTransport.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import { fail } from '../plugin/results.js';
import type { ToolResult } from '../plugin/types.js';
import { getErrorMessage } from '../utils.js';

/** Settings for one selected entry. */
export interface McpToolSettings {
  /** Tool parameter names for entry fields (e.g. `{ patch: 'config' }`). */
  inputAliases?: Readonly<Record<string, string>>;
  /** Parameters sent when the caller omits them. */
  defaults?: Readonly<Record<string, unknown>>;
  /** Per-call timeout in milliseconds; default the server's `timeoutMs`. */
  timeoutMs?: number;
}

/** A skill served as an MCP resource. */
export interface McpSkill {
  /** Resource URI (e.g. `skill://jeeves-watcher/SKILL.md`). */
  uri: string;
  /** Resource name. */
  name: string;
  /** Markdown content. */
  text: string;
}

/** What an MCP server over a catalog serves. */
export interface CatalogMcpContent<C extends Catalog = Catalog> {
  /** MCP server name. */
  name: string;
  /** MCP server version. */
  version: string;
  /** The endpoint catalog. */
  catalog: C;
  /** Tool name prefix (the component name). */
  prefix: string;
  /**
   * Catalog entries to expose as tools (`true` or settings), keyed by entry
   * name; unselected entries get no tool. Descriptions are the entries'.
   */
  tools: Partial<Record<C['entries'][number]['name'], true | McpToolSettings>>;
  /** Default per-call timeout in milliseconds. */
  timeoutMs: number;
  /** Always-on rules, sent as the server `instructions`. */
  instructions?: string;
  /** The component skill. */
  skill?: McpSkill;
}

/** Options for {@link createCatalogMcpServer}. */
export interface CatalogMcpServerOptions<
  C extends Catalog = Catalog,
> extends CatalogMcpContent<C> {
  /** How requests reach the service, with the caller's credentials. */
  transport: CatalogTransport;
}

/**
 * A jeeves tool result as an MCP one (same shape; `isError` always set).
 *
 * @param result - `ok`/`fail`/`toolResultFromResponse` result.
 * @returns The MCP tool result.
 */
const toCallToolResult = (result: ToolResult): CallToolResult => ({
  content: result.content.map(({ text }) => ({ type: 'text', text })),
  isError: result.isError === true,
});

/**
 * Call one tool: build the request, send it through the transport and map
 * the response.
 *
 * @param entry - The tool's catalog entry.
 * @param settings - The tool's settings.
 * @param args - Tool arguments.
 * @param options - Transport and default timeout.
 * @returns The tool result.
 */
async function callTool(
  entry: CatalogEntry,
  settings: McpToolSettings,
  args: Record<string, unknown>,
  options: Pick<CatalogMcpServerOptions, 'transport' | 'timeoutMs'>,
): Promise<CallToolResult> {
  let request;
  try {
    request = toolInputToRequest(
      entry,
      { ...settings.defaults, ...args },
      settings.inputAliases,
    );
  } catch (error) {
    return toCallToolResult(fail(error));
  }
  try {
    const res = await options.transport(
      request,
      AbortSignal.timeout(settings.timeoutMs ?? options.timeoutMs),
    );
    return toCallToolResult(await toolResultFromResponse(entry, res));
  } catch (error) {
    return toCallToolResult(
      fail(`service not reachable: ${getErrorMessage(error)}`),
    );
  }
}

/**
 * A tool input schema that no longer requires the given parameters: the
 * SDK checks arguments before the call fills in defaults.
 *
 * @param schema - Tool input schema.
 * @param names - Parameters with defaults.
 * @returns The schema.
 */
function withoutRequired(
  schema: Record<string, unknown>,
  names: string[],
): Record<string, unknown> {
  const { required, ...rest } = schema;
  if (!Array.isArray(required)) return schema;
  const left = required.filter(
    (name: unknown) => typeof name !== 'string' || !names.includes(name),
  );
  return left.length > 0 ? { ...rest, required: left } : rest;
}

/**
 * Create an MCP server over a catalog: the selected tools, in catalog order.
 * Connect it to any MCP transport, or return it from a `createMcpHandler`
 * factory.
 *
 * @param options - Content, selection and transport.
 * @returns The server.
 * @throws Error for an invalid tool name or invalid aliases.
 */
export function createCatalogMcpServer<C extends Catalog>(
  options: CatalogMcpServerOptions<C>,
): McpServer {
  const mcp = new McpServer(
    { name: options.name, version: options.version },
    options.instructions ? { instructions: options.instructions } : {},
  );

  const selection = options.tools as Partial<
    Record<string, true | McpToolSettings>
  >;
  for (const entry of options.catalog.entries) {
    const selected = selection[entry.name];
    if (selected === undefined) continue;
    const settings = selected === true ? {} : selected;
    const { name, description, inputSchema, annotations } =
      catalogToolDefinition(entry, {
        prefix: options.prefix,
        ...(settings.inputAliases
          ? { inputAliases: settings.inputAliases }
          : {}),
      });
    mcp.registerTool(
      name,
      {
        description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(
          withoutRequired(inputSchema, Object.keys(settings.defaults ?? {})),
        ),
        annotations,
      },
      (args) => callTool(entry, settings, args, options),
    );
  }

  const { skill } = options;
  if (skill)
    mcp.registerResource(
      skill.name,
      skill.uri,
      { description: `${skill.name} skill`, mimeType: 'text/markdown' },
      () => ({
        contents: [
          { uri: skill.uri, mimeType: 'text/markdown', text: skill.text },
        ],
      }),
    );

  return mcp;
}
