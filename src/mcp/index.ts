/**
 * `@karmaniverous/jeeves/mcp` entry point (#136).
 *
 * @remarks
 * A component's MCP endpoint, generated from its endpoint catalog: tools
 * from the shared tool definition, dispatched through the component's own
 * routes in-process. Needs `@modelcontextprotocol/server`, an optional peer
 * (import this entry point only where it is installed), and imports only
 * types from `fastify`: the app supplies its own Fastify instance.
 *
 * @packageDocumentation
 */

export {
  type CatalogMcpContent,
  type CatalogMcpServerOptions,
  createCatalogMcpServer,
  type McpSkill,
  type McpToolSettings,
} from './catalogMcpServer.js';
export { injectTransport } from './injectTransport.js';
export {
  credentialHeaderNames,
  MCP_PATH,
  type McpEndpointOptions,
  registerMcpEndpoint,
} from './registerMcpEndpoint.js';
