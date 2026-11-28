/**
 * An MCP server over an endpoint catalog (#136).
 *
 * @remarks
 * One tool per selected entry, from the shared tool definition (spec 5.7):
 * name, the entry's description, input schema and hints from `kind`. The
 * definitions are built and checked once, by {@link prepareCatalogMcpServer};
 * the factory it returns creates a server per transport (stateless serving
 * needs a server per request). Each call is built with `toolInputToRequest`,
 * sent through a {@link CatalogTransport} and mapped to an MCP result. The
 * rules are the server `instructions`; the skill is a resource. The SDK
 * validates arguments against the tool's JSON Schema first;
 * `toolInputToRequest` then parses them with the entry's own schemas.
 *
 * @module
 */

import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';

import { toolInputToRequest } from '../catalog/catalogTool.js';
import type { CatalogTransport } from '../catalog/httpTransport.js';
import type { Catalog } from '../catalog/types.js';
import { fail } from '../plugin/results.js';
import { getErrorMessage } from '../utils.js';
import {
  DEFAULT_MAX_IMAGE_BYTES,
  mcpResultFromResponse,
  toCallToolResult,
} from './mcpResult.js';
import { type PreparedTool, prepareTools } from './mcpTools.js';

/** Settings for one selected entry. */
export interface McpToolSettings {
  /** Tool parameter names for entry fields (e.g. `{ patch: 'config' }`). */
  inputAliases?: Readonly<Record<string, string>>;
  /**
   * Parameters sent when the caller omits them, keyed by tool parameter
   * name. They stay in the published schema, no longer required, and the
   * caller may override them.
   */
  defaults?: Readonly<Record<string, unknown>>;
  /**
   * Parameters always sent with these values, keyed by tool parameter name
   * (spec 5.2, Decision 97). They are removed from the published schema, so
   * an MCP client can neither see nor override them.
   */
  fixed?: Readonly<Record<string, unknown>>;
  /** Per-call timeout in milliseconds; default the content's `timeoutMs`. */
  timeoutMs?: number;
}

/** A skill served as an MCP resource. */
export interface McpSkill {
  /** Resource URI (e.g. `skill://jeeves-server/SKILL.md`). */
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
  /** Default per-call timeout in milliseconds; default 120 s. */
  timeoutMs?: number;
  /**
   * Largest image result, in decoded bytes (spec 5.2 Results); default
   * 5 MiB. A larger image is an error result stating its size and the limit.
   */
  maxImageBytes?: number;
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
 * Creates an MCP server whose tools send their calls through `transport`.
 */
export type CatalogMcpServerFactory = (
  transport: CatalogTransport,
) => McpServer;

/**
 * Call one tool: build the request, send it through the transport and map
 * the response.
 *
 * @param tool - The prepared tool.
 * @param args - Tool arguments.
 * @param transport - How the request reaches the service.
 * @param maxImageBytes - Largest image result.
 * @returns The tool result.
 */
async function callTool(
  tool: PreparedTool,
  args: Record<string, unknown>,
  transport: CatalogTransport,
  maxImageBytes: number,
): Promise<CallToolResult> {
  const { entry, settings } = tool;
  let request;
  try {
    request = toolInputToRequest(
      entry,
      { ...settings.defaults, ...args, ...settings.fixed },
      settings.inputAliases,
    );
  } catch (error) {
    return toCallToolResult(fail(error));
  }
  try {
    const res = await transport(request, AbortSignal.timeout(tool.timeoutMs));
    return await mcpResultFromResponse(entry, res, maxImageBytes);
  } catch (error) {
    return toCallToolResult(
      fail(`service not reachable: ${getErrorMessage(error)}`),
    );
  }
}

/**
 * Build and check the tool definitions once, and return a factory that
 * creates an MCP server per transport (spec 5.2, Decision 94).
 *
 * @remarks
 * Every configuration mistake throws here, so a component that calls this
 * at startup fails at startup, not on the first request.
 *
 * @param content - Content and tool selection.
 * @returns A factory: a server whose tools call through the given transport.
 * @throws Error for an unknown entry, a duplicate tool name, an invalid or
 *   colliding alias, an entry with a binary request body, a `fixed` key that
 *   names no parameter, or a parameter in both `defaults` and `fixed`.
 */
export function prepareCatalogMcpServer<C extends Catalog>(
  content: CatalogMcpContent<C>,
): CatalogMcpServerFactory {
  const tools = prepareTools(content);
  const maxImageBytes = content.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const { skill } = content;

  return (transport) => {
    const mcp = new McpServer(
      { name: content.name, version: content.version },
      content.instructions ? { instructions: content.instructions } : {},
    );
    for (const tool of tools)
      mcp.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        },
        (args) => callTool(tool, args, transport, maxImageBytes),
      );
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
  };
}

/**
 * Create one MCP server over a catalog: `prepareCatalogMcpServer(content)`
 * applied to `transport`. Connect it to any MCP transport; for a server per
 * request, use {@link prepareCatalogMcpServer} once instead.
 *
 * @param options - Content, selection and transport.
 * @returns The server.
 * @throws Error as {@link prepareCatalogMcpServer}.
 */
export function createCatalogMcpServer<C extends Catalog>(
  options: CatalogMcpServerOptions<C>,
): McpServer {
  const { transport, ...content } = options;
  return prepareCatalogMcpServer(content)(transport);
}
