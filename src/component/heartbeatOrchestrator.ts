/**
 * HEARTBEAT health orchestration.
 *
 * @remarks
 * Determines the state of each platform component and generates
 * HEARTBEAT entries with actionable alert text. Applies the dependency
 * graph for alert suppression and auto-decline.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE } from '../constants/paths.js';
import { PLATFORM_COMPONENTS } from '../constants/sections.js';
import { getServiceState } from '../discovery/getServiceState.js';
import { getServiceUrl } from '../discovery/getServiceUrl.js';
import type { HeartbeatEntry } from '../managed/heartbeat.js';
import { fetchWithTimeout } from '../plugin/http.js';
import {
  readComponentVersions,
  type ComponentVersionsState,
} from './componentVersions.js';
import type { ComponentDependencies } from './types.js';

/** Derive the full service name from a component name. */
export function toServiceName(name: string): string {
  return `jeeves-${name}`;
}

/** Component state as determined by the orchestrator. */
export type ComponentState =
  | 'not_installed'
  | 'deps_missing'
  | 'config_missing'
  | 'service_not_installed'
  | 'service_stopped'
  | 'healthy';

/** Known dependency declarations for platform components. */
const COMPONENT_DEPS: Record<string, ComponentDependencies> = {
  meta: { hard: ['watcher'], soft: [] },
  server: { hard: [], soft: ['watcher', 'runner', 'meta'] },
  runner: { hard: [], soft: [] },
  watcher: { hard: [], soft: [] },
};

/** Alert text — string or function that receives configRoot. */
type AlertTextValue = string | ((configRoot: string) => string);

/** "Not installed" alert text for each platform component. Shared with seedContent. */
export const NOT_INSTALLED_ALERTS: Record<string, string> = {
  runner:
    'Not installed. The runner is the job execution engine — it runs scheduled scripts for data fetching, transformation, and maintenance. Ask the user for consent to install. On approval, execute: `npx @karmaniverous/jeeves-runner-openclaw install`.',
  watcher:
    'Not installed. The watcher indexes documents into a vector store for semantic search. Ask the user for consent to install. On approval, execute: `npx @karmaniverous/jeeves-watcher-openclaw install`.',
  server:
    'Not installed. The server provides a web UI for document browsing, rendering, sharing, and search. Ask the user for consent to install. On approval, execute: `npx @karmaniverous/jeeves-server-openclaw install`.',
  meta:
    'Not installed. Meta is the knowledge synthesis engine. Requires jeeves-watcher. Ask the user for consent to install. On approval, install watcher first if needed, then execute: `npx @karmaniverous/jeeves-meta-openclaw install`.',
};

/** Alert text generators by state. */
const ALERT_TEXT: Record<string, Record<string, AlertTextValue>> = {
  runner: {
    not_installed:
      NOT_INSTALLED_ALERTS['runner'] ?? '',
    config_missing: (configRoot: string) =>
      `Plugin installed but no configuration file found at \`${configRoot}/jeeves-runner/config.json\`. The plugin installer should have created a default config. Ask the user for consent to re-run the installer: \`npx @karmaniverous/jeeves-runner-openclaw install\`.`,
    service_not_installed:
      'Plugin installed and configured but the system service is not installed. Ask the user for consent. On approval, execute: `jeeves-runner service install`. Verify the service is installed.',
    service_stopped:
      'Service installed but not running. Ask the user for consent. On approval, execute: `jeeves-runner service start`. Verify via `GET http://127.0.0.1:1937/status`.',
  },
  watcher: {
    not_installed:
      NOT_INSTALLED_ALERTS['watcher'] ?? '',
    deps_missing:
      'Plugin installed but Qdrant is not responding on `http://127.0.0.1:6333`. Qdrant is the vector database required for semantic search. Ask the user for consent to set up Qdrant. Guide them through installation for their platform — Docker is simplest: `docker run -p 6333:6333 qdrant/qdrant`. Verify via `GET http://127.0.0.1:6333/collections`.',
    config_missing: (configRoot: string) =>
      `Plugin installed, Qdrant available, but config file missing or invalid at \`${configRoot}/jeeves-watcher/config.json\`. The plugin installer should have created a default config. If missing, re-run: \`npx @karmaniverous/jeeves-watcher-openclaw install\`.`,
    service_not_installed:
      'Plugin installed and configured but the system service is not installed. Ask the user for consent. On approval, execute: `jeeves-watcher service install`. Verify the service is installed.',
    service_stopped:
      'Service installed but not running. Ask the user for consent. On approval, execute: `jeeves-watcher service start`. Verify via `GET http://127.0.0.1:1936/status`.',
  },
  server: {
    not_installed:
      NOT_INSTALLED_ALERTS['server'] ?? '',
    config_missing: (configRoot: string) =>
      `Plugin installed but config file missing or invalid at \`${configRoot}/jeeves-server/config.json\`. The plugin installer should have created a default config. If missing, re-run: \`npx @karmaniverous/jeeves-server-openclaw install\`.`,
    service_not_installed:
      'Plugin installed and configured but the system service is not installed. Ask the user for consent. On approval, execute: `jeeves-server service install`. Verify the service is installed.',
    service_stopped:
      'Service installed but not running. Ask the user for consent. On approval, execute: `jeeves-server service start`. Verify via `GET http://127.0.0.1:1934/status`.',
  },
  meta: {
    not_installed:
      NOT_INSTALLED_ALERTS['meta'] ?? '',
    deps_missing:
      'Plugin installed but required dependency jeeves-watcher is not available. The watcher must be installed and running before meta can function. Do not attempt to set up meta until jeeves-watcher is healthy.',
    config_missing: (configRoot: string) =>
      `Plugin installed, watcher available, but config file missing or invalid at \`${configRoot}/jeeves-meta/config.json\`. The plugin installer should have created a default config. If missing, re-run: \`npx @karmaniverous/jeeves-meta-openclaw install\`.`,
    service_not_installed:
      'Plugin installed and configured but the system service is not installed. Ask the user for consent. On approval, execute: `jeeves-meta service install`. Verify the service is installed.',
    service_stopped:
      'Service installed but not running. Ask the user for consent. On approval, execute: `jeeves-meta service start`. Verify via `GET http://127.0.0.1:1938/status`.',
  },
};

/** Default Qdrant URL for watcher dependency check. */
const QDRANT_URL = 'http://127.0.0.1:6333';

/** Health probe timeout in milliseconds. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Check if Qdrant is reachable (watcher dependency).
 *
 * @returns True if Qdrant responds.
 */
async function isQdrantAvailable(): Promise<boolean> {
  try {
    await fetchWithTimeout(`${QDRANT_URL}/collections`, PROBE_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine the state of a single component.
 *
 * @param name - Component name.
 * @param registry - Current component-versions.json contents.
 * @param configRoot - Config root path.
 * @param healthySet - Set of component names known to be healthy (for dep checks).
 * @returns The component's state.
 */
async function determineComponentState(
  name: string,
  registry: ComponentVersionsState,
  configRoot: string,
  healthySet: Set<string>,
): Promise<ComponentState> {
  // Not in registry = not installed
  if (!(name in registry)) return 'not_installed';

  // Check hard dependencies
  const deps = COMPONENT_DEPS[name];
  if (deps) {
    for (const hardDep of deps.hard) {
      if (!healthySet.has(hardDep)) return 'deps_missing';
    }
  }

  // Watcher-specific: check Qdrant
  if (name === 'watcher' && !(await isQdrantAvailable())) {
    return 'deps_missing';
  }

  // Check config file
  const configPath = join(configRoot, `jeeves-${name}`, CONFIG_FILE);
  if (!existsSync(configPath)) return 'config_missing';

  // Fast path: probe HTTP health endpoint
  try {
    const url = getServiceUrl(name);
    await fetchWithTimeout(`${url}/status`, PROBE_TIMEOUT_MS);
    return 'healthy';
  } catch {
    // Service not responding — classify sub-state
    const serviceState = getServiceState(toServiceName(name));
    if (serviceState === 'not_installed') return 'service_not_installed';
    if (serviceState === 'stopped') return 'service_stopped';
    // serviceState === 'running' but HTTP failed — still treat as stopped
    return 'service_stopped';
  }
}

/**
 * Generate the alert text for a component in a given state.
 *
 * @param name - Component name.
 * @param state - The component's state.
 * @param configRoot - Config root path.
 * @returns Alert text (list items), or empty string if healthy.
 */
function generateAlertText(
  name: string,
  state: ComponentState,
  configRoot: string,
): string {
  if (state === 'healthy') return '';

  const componentAlerts = ALERT_TEXT[name];
  if (!componentAlerts) return '';

  const alertOrFn = componentAlerts[state];
  if (!alertOrFn) return '';

  const text =
    typeof alertOrFn === 'function' ? alertOrFn(configRoot) : alertOrFn;
  return `- ${text}`;
}

/** Options for the orchestrator. */
export interface OrchestrateHeartbeatOptions {
  /** Path to the core config directory. */
  coreConfigDir: string;
  /** Path to the config root. */
  configRoot: string;
  /** Existing declined component names (from parsing current HEARTBEAT). */
  declinedNames: Set<string>;
}

/**
 * Orchestrate HEARTBEAT entries for all platform components.
 *
 * @param options - Orchestration configuration.
 * @returns Array of HeartbeatEntry for writeHeartbeatSection.
 */
export async function orchestrateHeartbeat(
  options: OrchestrateHeartbeatOptions,
): Promise<HeartbeatEntry[]> {
  const { coreConfigDir, configRoot, declinedNames } = options;
  const registry = readComponentVersions(coreConfigDir);

  // First pass: determine which components are healthy (for dep resolution)
  const healthySet = new Set<string>();
  for (const name of PLATFORM_COMPONENTS) {
    if (declinedNames.has(toServiceName(name))) continue;
    if (!(name in registry)) continue;

    try {
      const url = getServiceUrl(name);
      await fetchWithTimeout(`${url}/status`, PROBE_TIMEOUT_MS);
      healthySet.add(name);
    } catch {
      // Not healthy — will be classified in second pass
    }
  }

  // Second pass: generate entries
  const entries: HeartbeatEntry[] = [];

  for (const name of PLATFORM_COMPONENTS) {
    const fullName = toServiceName(name);

    // Declined
    if (declinedNames.has(fullName)) {
      // Auto-decline dependents of declined hard deps
      entries.push({ name: fullName, declined: true, content: '' });
      continue;
    }

    const state = await determineComponentState(
      name,
      registry,
      configRoot,
      healthySet,
    );

    // Auto-decline if hard dep is declined
    const deps = COMPONENT_DEPS[name];
    if (deps) {
      const hardDepDeclined = deps.hard.some((d) =>
        declinedNames.has(toServiceName(d)),
      );
      if (hardDepDeclined) {
        entries.push({ name: fullName, declined: true, content: '' });
        continue;
      }
    }

    const alertText = generateAlertText(name, state, configRoot);
    entries.push({ name: fullName, declined: false, content: alertText });
  }

  // Add soft-dep informational alerts for any healthy component with soft deps
  for (const entry of entries) {
    if (entry.declined || entry.content) continue;

    // Entry is healthy (no alert, not declined) — check for soft deps
    const shortName = entry.name.replace(/^jeeves-/, '');
    const deps = COMPONENT_DEPS[shortName];
    if (!deps?.soft.length) continue;

    const softAlerts: string[] = [];
    for (const dep of deps.soft) {
      const depFullName = toServiceName(dep);
      if (declinedNames.has(depFullName)) continue;
      if (!healthySet.has(dep)) {
        softAlerts.push(
          `- ${entry.name} is running. Some features are unavailable because ${depFullName} is not installed/running.`,
        );
      }
    }
    if (softAlerts.length > 0) {
      entry.content = softAlerts.join('\n');
    }
  }

  return entries;
}
