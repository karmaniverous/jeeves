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
 * Components add domain-specific tools separately.
 */

import type { JeevesComponentDescriptor } from '../component/descriptor.js';
import { createServiceManager } from '../service/createServiceManager.js';
import { getErrorMessage } from '../utils.js';
import { fetchJson, fetchWithTimeout, postJson } from './http.js';
import { connectionFail, fail, ok } from './results.js';
import type { ToolDescriptor, ToolResult } from './types.js';

/** Timeout for HTTP probes in milliseconds. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Create the standard plugin tool set from a component descriptor.
 *
 * @param descriptor - The component descriptor.
 * @returns Array of tool descriptors to register.
 */
export function createPluginToolset(
  descriptor: JeevesComponentDescriptor,
): ToolDescriptor[] {
  const { name, defaultPort } = descriptor;
  const baseUrl = `http://127.0.0.1:${String(defaultPort)}`;
  const svcManager = createServiceManager(descriptor);

  const statusTool: ToolDescriptor = {
    name: `${name}_status`,
    description: `Get ${name} service health, version, and uptime.`,
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (): Promise<ToolResult> => {
      try {
        const res = await fetchWithTimeout(
          `${baseUrl}/status`,
          PROBE_TIMEOUT_MS,
        );
        if (!res.ok) {
          return fail(`HTTP ${String(res.status)}: ${await res.text()}`);
        }
        const data = await res.json();
        return ok(data);
      } catch (err: unknown) {
        return connectionFail(err, baseUrl, `jeeves-${name}-openclaw`);
      }
    },
  };

  const configTool: ToolDescriptor = {
    name: `${name}_config`,
    description: `Query ${name} running configuration. Optional JSONPath filter.`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'JSONPath expression (optional)',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const path = params.path as string | undefined;
      const qs = path ? `?path=${encodeURIComponent(path)}` : '';
      try {
        const result = await fetchJson(`${baseUrl}/config${qs}`);
        return ok(result);
      } catch (err: unknown) {
        return connectionFail(err, baseUrl, `jeeves-${name}-openclaw`);
      }
    },
  };

  const configApplyTool: ToolDescriptor = {
    name: `${name}_config_apply`,
    description: `Apply a config patch to the running ${name} service.`,
    parameters: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Config patch to apply',
        },
      },
      required: ['config'],
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const config = params.config as Record<string, unknown> | undefined;
      if (!config) {
        return fail('Missing required parameter: config');
      }
      try {
        const result = await postJson(`${baseUrl}/config/apply`, {
          patch: config,
        });
        return ok(result);
      } catch (err: unknown) {
        return connectionFail(err, baseUrl, `jeeves-${name}-openclaw`);
      }
    },
  };

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
          const state = svcManager.status();
          return Promise.resolve(ok({ service: name, state }));
        }

        // Call the appropriate method
        const methodMap: Record<string, () => void> = {
          install: () => {
            svcManager.install();
          },
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

  return [statusTool, configTool, configApplyTool, serviceTool];
}
