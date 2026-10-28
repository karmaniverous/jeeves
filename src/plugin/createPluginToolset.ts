/**
 * Factory for the standard plugin tool set.
 *
 * @remarks
 * Produces four standard tools from a component descriptor:
 * - `{name}_status` - Probe service health + version + uptime
 * - `{name}_config` - Query running config with optional JSONPath
 * - `{name}_config_apply` - Push config patch to running service
 * - `{name}_service` - Service lifecycle management
 *
 * The HTTP tools call the plugin's configured `apiUrl` (see
 * {@link PluginToolsetOptions}); the descriptor's `defaultPort` is only the
 * fallback when `apiUrl` is unset.
 *
 * Components add domain-specific tools separately.
 */

import { credentialOf } from '../catalog/clientAuth.js';
import { standardEntries } from '../catalog/standardEntries.js';
import type { Catalog, CatalogEntry } from '../catalog/types.js';
import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { createServiceManager } from '../service/createServiceManager.js';
import { getErrorMessage } from '../utils.js';
import {
  catalogPluginTool,
  type CatalogPluginToolOptions,
} from './catalogPluginTool.js';
import { DEFAULT_FETCH_TIMEOUT_MS } from './http.js';
import {
  type CatalogToolSelection,
  type PluginToolsetOptions,
  pluginToolsetOptionsSchema,
  resolvePluginApiUrl,
} from './pluginApiUrl.js';
import { fail, ok } from './results.js';
import type { ToolDescriptor, ToolResult } from './types.js';

/** Timeout for HTTP probes in milliseconds. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Create the standard plugin tool set from a component descriptor.
 *
 * @param descriptor - The component descriptor.
 * @param options - Tool options (required, so each plugin consciously
 *   chooses its service URL). Pass the plugin's `apiUrl` (string or lazy
 *   resolver); with `apiUrl` unset, the tools call
 *   `http://127.0.0.1:<defaultPort>`.
 * @returns Array of tool descriptors to register.
 */
export function createPluginToolset<C extends Catalog = Catalog>(
  descriptor: JeevesComponentDescriptor,
  options: PluginToolsetOptions<C>,
): ToolDescriptor[] {
  const { name, defaultPort } = descriptor;
  const parsed = pluginToolsetOptionsSchema.parse(
    options,
  ) as PluginToolsetOptions<C>;
  const { apiUrl } = parsed;
  const resolveBaseUrl = (): string => resolvePluginApiUrl(apiUrl, defaultPort);
  const svcManager = createServiceManager(descriptor);

  const pluginId = `jeeves-${name}-openclaw`;
  const credential =
    // Without a catalog the standard entries are open ('none'), so the
    // credential attaches nowhere, as in 0.7.0.
    parsed.auth ? credentialOf(parsed.auth) : undefined;
  const catalog = parsed.catalog;
  const standard = catalog
    ? (['status', 'config', 'configApply'] as const).map((n) => {
        if (!catalog.entries.some((e) => e.name === n))
          throw new Error(
            `createPluginToolset: catalog must include standardEntries(name, ...) (missing "${n}")`,
          );
        return catalog.byName(n);
      })
    : standardEntries(name, { auth: { config: 'none' } });
  const toolFor = (
    entry: CatalogEntry,
    settings: Omit<
      CatalogPluginToolOptions,
      'prefix' | 'resolveBaseUrl' | 'pluginId' | 'credential' | 'timeoutMs'
    > & { timeoutMs?: number },
  ): ToolDescriptor =>
    catalogPluginTool(entry, {
      timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
      ...settings,
      prefix: name,
      resolveBaseUrl,
      pluginId,
      ...(credential ? { credential } : {}),
    });

  const statusTool = toolFor(standard[0], {
    description: `Get ${name} service health, version, and uptime.`,
    timeoutMs: PROBE_TIMEOUT_MS,
  });
  const configTool = toolFor(standard[1], {
    description: `Query ${name} running configuration. Optional JSONPath filter.`,
  });
  const configApplyTool = toolFor(standard[2], {
    description: `Apply a config patch to the running ${name} service.`,
    inputAliases: { patch: 'config' },
  });

  const serviceTool: ToolDescriptor = {
    name: `${name}_service`,
    description: `Manage the ${name} system service. Actions: install, uninstall, start, stop, restart, status.`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['install', 'uninstall', 'start', 'stop', 'restart', 'status'],
          description: 'Service action to perform',
        },
      },
      required: ['action'],
    },
    execute: (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const action = params.action as string;
      const validActions = [
        'install',
        'uninstall',
        'start',
        'stop',
        'restart',
        'status',
      ];
      if (!validActions.includes(action)) {
        return Promise.resolve(fail(`Invalid action: ${action}`));
      }

      try {
        if (action === 'status') {
          const status = svcManager.statusDetail();
          return Promise.resolve(ok({ service: name, ...status }));
        }

        if (action === 'install') {
          const { existing, message } = svcManager.install();
          return Promise.resolve(
            ok({ service: name, action, success: true, existing, message }),
          );
        }

        // Call the appropriate method
        const methodMap: Record<string, () => void> = {
          uninstall: () => {
            svcManager.uninstall();
          },
          start: () => {
            svcManager.start();
          },
          stop: () => {
            svcManager.stop();
          },
          restart: () => {
            svcManager.restart();
          },
        };
        methodMap[action]();
        return Promise.resolve(ok({ service: name, action, success: true }));
      } catch (err: unknown) {
        return Promise.resolve(
          fail(`Service ${action} failed: ${getErrorMessage(err)}`),
        );
      }
    },
  };

  const catalogTools = parsed.tools
    ? catalogToolsFor(catalog, parsed.tools, toolFor)
    : [];
  const customTools =
    parsed.api && descriptor.customPluginTools
      ? (descriptor.customPluginTools(parsed.api) as ToolDescriptor[])
      : [];

  const all = [
    statusTool,
    configTool,
    configApplyTool,
    serviceTool,
    ...catalogTools,
    ...customTools,
  ];
  const seen = new Set<string>();
  for (const tool of all) {
    if (seen.has(tool.name))
      throw new Error(`Duplicate tool name: ${tool.name}`);
    seen.add(tool.name);
  }
  return all;
}

/**
 * Tools for the selected catalog entries, in catalog order.
 *
 * @param catalog - The catalog (required when `tools` is set).
 * @param selection - Entry name to `true` or settings.
 * @param toolFor - Builds one tool.
 * @returns The tools.
 * @throws Error when `catalog` is missing or a selected name isn't an entry.
 */
function catalogToolsFor(
  catalog: Catalog | undefined,
  selection: Partial<Record<string, true | CatalogToolSelection>>,
  toolFor: (
    entry: CatalogEntry,
    settings: CatalogToolSelection,
  ) => ToolDescriptor,
): ToolDescriptor[] {
  if (!catalog) throw new Error('createPluginToolset: tools requires catalog');
  const names = new Set(catalog.entries.map((e) => e.name));
  for (const key of Object.keys(selection))
    if (!names.has(key))
      throw new Error(
        `createPluginToolset: tools names unknown entry "${key}"`,
      );
  return catalog.entries
    .filter((e) => e.name in selection)
    .map((e) => {
      const settings = selection[e.name];
      return toolFor(e, settings === true || !settings ? {} : settings);
    });
}
