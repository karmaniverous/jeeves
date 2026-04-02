---
title: Building a Component Plugin
---

# Building a Component Plugin

This guide walks through building a Jeeves component plugin: an OpenClaw plugin that uses the `@karmaniverous/jeeves` library to maintain its TOOLS.md section and participate in platform content management.

## Prerequisites

- An OpenClaw plugin project (TypeScript, ESM)
- A Jeeves service with an HTTP health endpoint (`/status` or `/health`)
- `@karmaniverous/jeeves` installed as a dependency (not peer, not dev)

## Step 1: Add the Dependency

```bash
npm install @karmaniverous/jeeves
```

Each plugin bundles its own copy of the library. No shared singleton, no install-order constraints.

## Step 2: Resolve Workspace and Settings

Use the Plugin SDK's resolution helpers to bootstrap paths and configuration from the OpenClaw gateway's `api` object:

```typescript
import {
  resolveWorkspacePath,
  resolvePluginSetting,
} from '@karmaniverous/jeeves';

const PLUGIN_ID = 'jeeves-watcher-openclaw';

// Resolve the workspace root (three-step fallback):
//   api.config.agents.defaults.workspace → api.resolvePath('.') → process.cwd()
const workspacePath = resolveWorkspacePath(api);

// Resolve a plugin setting (three-step fallback):
//   plugin config → environment variable → default value
const apiUrl = resolvePluginSetting(
  api, PLUGIN_ID, 'apiUrl', 'JEEVES_WATCHER_URL', 'http://127.0.0.1:1936'
);

const configRoot = resolvePluginSetting(
  api, PLUGIN_ID, 'configRoot', 'JEEVES_CONFIG_ROOT', 'j:/config'
);
```

## Step 3: Initialize Core

Call `init()` once at startup before any other core library functions:

```typescript
import { init } from '@karmaniverous/jeeves';

init({ workspacePath, configRoot });
```

This caches the workspace and config root paths. All namespaced paths derive from these values:
- `{configRoot}/jeeves-core/` — core config, templates, component versions state
- `{configRoot}/jeeves-{name}/` — component-specific config

## Step 4: Implement the JeevesComponent Interface

The `JeevesComponent` interface is the contract between your plugin and the Jeeves platform:

```typescript
import type { JeevesComponent } from '@karmaniverous/jeeves';

const component: JeevesComponent = {
  // Identity
  name: 'watcher',        // Used to derive config directory
  version: '0.10.1',      // Your plugin package version
  sectionId: 'Watcher',   // H2 heading in TOOLS.md

  // Optional npm package names (for registry update checks)
  servicePackage: '@karmaniverous/jeeves-watcher',
  pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',

  // Prime-interval refresh (seconds). Must be a prime number.
  refreshIntervalSeconds: 71,

  // Content generator: called on every refresh cycle
  generateToolsContent: () => {
    return [
      'Search index: 464,230 chunks across 24 inference rules.',
      '',
      '### Score Thresholds',
      '- Strong: >= 0.75',
      '- Relevant: >= 0.5',
      '- Noise: < 0.25',
    ].join('\n');
  },

  // Service lifecycle
  serviceCommands: {
    stop: async () => { /* stop your service */ },
    uninstall: async () => { /* uninstall your service */ },
    status: async () => ({
      running: true,
      version: '0.10.1',
      uptimeSeconds: 86400,
    }),
  },

  // Plugin lifecycle
  pluginCommands: {
    uninstall: async () => { /* clean up plugin artifacts */ },
  },
};
```

### Why Prime Intervals?

Four component plugins writing to the same file need to avoid collisions. Prime-second intervals prevent harmonic alignment — the closest pair (61 & 67) first collides at 68 minutes; all four align once every 247 days. File-level locking handles the rare collisions that remain.

Default intervals: server (61s), runner (67s), watcher (71s), meta (73s).

### Async Content via createAsyncContentCache

`generateToolsContent()` is synchronous, but most components fetch live data from their HTTP service. The `createAsyncContentCache` utility bridges the gap:

```typescript
import { createAsyncContentCache } from '@karmaniverous/jeeves';

const getContent = createAsyncContentCache({
  fetch: async () => {
    const res = await fetch('http://127.0.0.1:1936/status');
    return formatWatcherStatus(await res.json());
  },
  placeholder: '> Initializing watcher status...',
});

// Use as generateToolsContent:
const component: JeevesComponent = {
  // ...
  generateToolsContent: getContent,
};
```

First call returns the placeholder. Subsequent calls return the last successfully fetched content while kicking off a background refresh. Failed refreshes retain the previous good value.

## Step 5: Create the Writer and Start

```typescript
import { createComponentWriter } from '@karmaniverous/jeeves';

const writer = createComponentWriter(component);
writer.start();

// On plugin shutdown:
// writer.stop();
```

### What Happens on Each Cycle

1. `generateToolsContent()` is called — your plugin produces its section content
2. The content is written to TOOLS.md as an H2 section (e.g., `## Watcher`) via `updateManagedSection` in section mode
3. `refreshPlatformContent()` runs: probes all service ports, reads the shared `component-versions.json` state file, renders the Platform section with live health data, and writes SOUL.md and AGENTS.md managed blocks
4. Your component's version entry is written to `component-versions.json` (including service version from the health probe)
5. Templates are copied to the config directory if present
6. Version-stamp convergence ensures the highest library version wins for shared block-mode content
7. Cleanup escalation: if a gateway URL is configured, managed files are scanned for the cleanup flag. When detected, a cleanup session is spawned via the gateway to automatically resolve orphaned content.
8. HEARTBEAT orchestration: the component health state machine runs, updating HEARTBEAT.md with per-component alerts (not installed, deps missing, config missing, service stopped, etc.)

All of this is handled internally by the `ComponentWriter`. Your plugin only provides the content generator and lifecycle commands.

## Step 6: Register Tools

Use the Plugin SDK's result formatters and HTTP helpers to register tools with the OpenClaw gateway:

```typescript
import {
  ok,
  fail,
  connectionFail,
  fetchJson,
  postJson,
} from '@karmaniverous/jeeves';
import type { PluginApi } from '@karmaniverous/jeeves';

function registerTools(api: PluginApi): void {
  api.registerTool({
    name: 'watcher_search',
    description: 'Semantic search over indexed documents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text.' },
        limit: { type: 'number', description: 'Max results.' },
      },
      required: ['query'],
    },
    execute: async (_id, params) => {
      try {
        const data = await postJson(`${apiUrl}/search`, params);
        return ok(data);
      } catch (error) {
        return connectionFail(error, apiUrl, PLUGIN_ID);
      }
    },
  });
}
```

## Step 7: Config Query Handler (Service Side)

If your service exposes an HTTP API, use `createConfigQueryHandler` to add a `GET /config` endpoint with JSONPath support:

```typescript
import { createConfigQueryHandler } from '@karmaniverous/jeeves';

const handleConfigQuery = createConfigQueryHandler(() => myServiceConfig);

// In your HTTP server (e.g., Express, Fastify):
app.get('/config', async (req, res) => {
  const result = await handleConfigQuery({ path: req.query.path as string });
  res.status(result.status).json(result.body);
});
```

Callers can query the full config or filter with JSONPath:
- `GET /config` → full config document
- `GET /config?path=$.watch.roots` → matching results with count

## Step 8: Plugin Uninstall with removeManagedSection

When your plugin is uninstalled, remove its TOOLS.md section:

```typescript
import { removeManagedSection, TOOLS_MARKERS } from '@karmaniverous/jeeves';

async function uninstallPlugin(): Promise<void> {
  const toolsPath = join(workspacePath, 'TOOLS.md');

  // Remove just this component's section
  await removeManagedSection(toolsPath, {
    sectionId: 'Watcher',
    markers: TOOLS_MARKERS,
  });

  // If it was the last section, the entire managed block is removed automatically.
}
```

## Step 9: CLI Install/Uninstall with patchConfig

Plugin CLI installers use `patchConfig` to register/unregister the plugin in `openclaw.json`:

```typescript
import {
  resolveOpenClawHome,
  resolveConfigPath,
  patchConfig,
} from '@karmaniverous/jeeves';
import { readFileSync, writeFileSync } from 'node:fs';

const home = resolveOpenClawHome();
const configPath = resolveConfigPath(home);

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const messages = patchConfig(config, 'jeeves-watcher-openclaw', 'add');
writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

for (const msg of messages) console.log(`  ✓ ${msg}`);
```

`patchConfig` manages `plugins.entries.{pluginId}` and `tools.alsoAllow`. It's idempotent: adding twice produces no duplicates; removing when absent produces no errors.

## Config Directory

Core automatically derives your component's config directory from `configRoot` and your component name:

```
{configRoot}/jeeves-{name}/    → e.g., j:/config/jeeves-watcher/
```

Access it via:

```typescript
const configDir = writer.componentConfigDir;
// → 'j:/config/jeeves-watcher'
```

Put your component-specific config here. The core config lives at `{configRoot}/jeeves-core/`.

## Runtime Validation

`createComponentWriter()` validates the component descriptor at runtime:

- `refreshIntervalSeconds` must be a prime number
- `name`, `version`, `sectionId` must be non-empty strings
- `generateToolsContent` must be a function
- `serviceCommands` must provide `stop`, `uninstall`, and `status`
- `pluginCommands` must provide `uninstall`

If validation fails, the factory throws with a descriptive error. This catches misconfiguration at startup, not at the first write cycle.

## Testing Your Plugin

Test that your content generator produces valid markdown and that the writer integrates correctly:

```typescript
import { init, createComponentWriter, parseManaged } from '@karmaniverous/jeeves';
import { readFileSync, writeFileSync } from 'fs';

// Set up a temp workspace
init({ workspacePath: tmpDir, configRoot: tmpConfigDir });
writeFileSync(join(tmpDir, 'TOOLS.md'), '');

const writer = createComponentWriter(myComponent, { probeTimeoutMs: 100 });
await writer.cycle();

const content = readFileSync(join(tmpDir, 'TOOLS.md'), 'utf-8');
const parsed = parseManaged(content);
expect(parsed.sections.find(s => s.id === 'MySection')).toBeDefined();
```
