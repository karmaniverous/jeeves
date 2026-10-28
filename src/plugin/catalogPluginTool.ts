/**
 * Plugin tools built from catalog entries (spec 5.7).
 *
 * @module
 */

import {
  catalogToolDefinition,
  toolInputToRequest,
  toolResultFromResponse,
} from '../catalog/catalogTool.js';
import { attachCredential, type Credential } from '../catalog/clientAuth.js';
import { CatalogClientError } from '../catalog/clientError.js';
import { httpTransport } from '../catalog/httpTransport.js';
import type { CatalogEntry } from '../catalog/types.js';
import { connectionFail, fail } from './results.js';
import type { ToolDescriptor, ToolResult } from './types.js';

/** What a catalog-built plugin tool needs besides its entry. */
export interface CatalogPluginToolOptions {
  /** Tool name prefix (the component name). */
  prefix: string;
  /** Description override. */
  description?: string;
  /** Tool parameter names for entry fields, keyed by entry field. */
  inputAliases?: Readonly<Record<string, string>>;
  /** `'direct-only'` to stay model-visible under Tool Search. */
  catalogMode?: 'direct-only';
  /** Request timeout in milliseconds. */
  timeoutMs: number;
  /** Resolves the service base URL on each call. */
  resolveBaseUrl: () => string;
  /** Credential to attach where the entry's `auth` accepts it. */
  credential?: Credential;
  /** Plugin id, for `connectionFail`'s `apiUrl` guidance. */
  pluginId: string;
}

/**
 * An input error with each issue's field and reason appended, so the model
 * can correct its call (`replace: expected boolean, received string`).
 *
 * @param error - Error from building the request.
 * @returns The error, or a message listing its issues.
 */
function withIssues(error: unknown): unknown {
  if (!(error instanceof CatalogClientError) || !error.issues?.length)
    return error;
  const details = error.issues
    .map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`)
    .join('; ');
  return `${error.message}: ${details}`;
}

/**
 * A plugin tool for one catalog entry: the shared tool definition, plus a
 * call that checks required aliased parameters (as the 0.7.0 tools did),
 * builds the request, attaches the credential and maps the response.
 *
 * @param entry - Catalog entry.
 * @param options - Prefix, overrides, timeout, base URL and credential.
 * @returns The tool.
 */
export function catalogPluginTool(
  entry: CatalogEntry,
  options: CatalogPluginToolOptions,
): ToolDescriptor {
  const aliases = options.inputAliases ?? {};
  const definition = catalogToolDefinition(entry, {
    prefix: options.prefix,
    ...(options.description ? { description: options.description } : {}),
    inputAliases: aliases,
  });
  const required = (definition.inputSchema.required ?? []) as string[];
  const requiredAliases = Object.values(aliases).filter((a) =>
    required.includes(a),
  );

  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
    ...(options.catalogMode ? { catalogMode: options.catalogMode } : {}),
    execute: async (_id, params): Promise<ToolResult> => {
      for (const alias of requiredAliases)
        if (params[alias] === undefined || params[alias] === null)
          return fail(`Missing required parameter: ${alias}`);
      let request;
      try {
        request = toolInputToRequest(entry, params, aliases);
      } catch (error) {
        return fail(withIssues(error));
      }
      const baseUrl = options.resolveBaseUrl();
      try {
        await attachCredential(entry, request, options.credential);
        const res = await httpTransport({ baseUrl })(
          request,
          AbortSignal.timeout(options.timeoutMs),
        );
        return await toolResultFromResponse(entry, res);
      } catch (error) {
        return connectionFail(error, baseUrl, options.pluginId);
      }
    },
  };
}
