---
title: Building a Component Plugin
---

# Building a Component Plugin

This guide walks through building a Jeeves component plugin: a standard OpenClaw plugin that uses `@karmaniverous/jeeves` for settings resolution, tools, always-in-context rules, and lifecycle hygiene.

Plugins do **not** write workspace files. Static platform content (SOUL/AGENTS managed blocks, platform skills) is rendered by the installer; live state is served by your plugin's tools. Upgrading a v0.x plugin? See [Migrating to v1](migrating-to-v1.md).

## Prerequisites

- An OpenClaw plugin project (TypeScript, ESM) with an `openclaw.plugin.json` manifest
- A Jeeves service with an HTTP health endpoint (`/status` or `/health`)
- `@karmaniverous/jeeves` installed as a dependency (not peer, not dev)

## Step 1: Add the Dependency

```bash
npm install @karmaniverous/jeeves
```

Each plugin bundles its own copy of the library. Importing it registers no process signal handlers and starts no timers.

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
  api,
  PLUGIN_ID,
  'apiUrl',
  'JEEVES_WATCHER_URL',
  'http://127.0.0.1:1936',
);

const configRoot = resolvePluginSetting(
  api,
  PLUGIN_ID,
  'configRoot',
  'JEEVES_CONFIG_ROOT',
  'j:/config',
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

## Step 4: Describe the Component

The descriptor drives the service CLI, service manager, config handlers, and the standard plugin toolset:

```typescript
import {
  jeevesComponentDescriptorSchema,
  type JeevesComponentDescriptor,
} from '@karmaniverous/jeeves';

export const descriptor: JeevesComponentDescriptor =
  jeevesComponentDescriptorSchema.parse({
    name: 'watcher',
    version: pkgVersion,
    servicePackage: '@karmaniverous/jeeves-watcher',
    pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    defaultPort: 1936,
    configSchema: watcherConfigSchema,
    configFileName: 'config.json',
    initTemplate: () => ({
      /* default config */
    }),
    startCommand: (configPath) => ['node', serviceEntry, '-c', configPath],
    run: async (configPath) => startService(configPath),
  });
```

`createPluginToolset(descriptor)` returns the standard `{name}_status`, `{name}_config`, `{name}_config_apply`, and `{name}_service` tools.

## Step 5: Register Tools

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

## Step 6: Always-in-Context Rules

Rules the agent must see on every turn (e.g. "search before grepping") are injected with OpenClaw's `before_prompt_build` hook, returning `{ appendSystemContext }`:

```typescript
import { registerPromptContext, type PluginApi } from '@karmaniverous/jeeves';

const RULES = `## Watcher
- Run watcher_search FIRST when finding files in indexed paths.`;

export default function register(api: PluginApi): void {
  registerPromptContext(api, { content: RULES, priority: 10 });
  registerTools(api);
}
```

- Keep rules short and static. Put detail in your skill; put live numbers behind a tool.
- For dynamic text, pass a provider (`content: () => string | Promise<string>`), ideally a `createAsyncContentCache` accessor so prompt builds don't wait on the network.
- Never return `systemPrompt`: it replaces the entire system prompt. The helper's result type can't express it.
- **Required host config:** `plugins.entries.<id>.hooks.allowConversationAccess: true`. Without it OpenClaw silently skips the hook for non-bundled plugins, and `--accept-capabilities` does not set it.

## Step 7: Lifecycle Hygiene

`openclaw plugins inspect` and other CLI commands load your plugin and must exit on their own. So:

- Never call `process.on('SIGINT' | 'SIGTERM' | 'exit', …)` or depend on packages that do (e.g. `signal-exit` via `proper-lockfile`). Check with `npm ls signal-exit --omit=dev`.
- Start no timers or sockets at `register()` time unless they are tied to the plugin lifecycle:

```typescript
import { onPluginDispose } from '@karmaniverous/jeeves';

const timer = setInterval(poll, 60_000);
if (
  !onPluginDispose(api, 'watcher-poll', () => {
    clearInterval(timer);
  })
) {
  clearInterval(timer); // host has no lifecycle API: don't run background work
}
```

## Step 8: Config Query Handler (Service Side)

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

## Step 9: Ship Your Skill

Skills ship inside the plugin package and are declared in the manifest (`openclaw.plugin.json`: `"skills": ["skills"]`). Every `SKILL.md` needs `name` and `description` frontmatter or OpenClaw skips it; enforce that in a test:

```typescript
import { validateSkillFrontmatter } from '@karmaniverous/jeeves';

expect(() =>
  validateSkillFrontmatter(readFileSync(skillPath, 'utf-8')),
).not.toThrow();
```

## Installing

Plugins are installed and updated with the standard OpenClaw CLI; there is no plugin-specific installer:

```bash
openclaw plugins install npm:@karmaniverous/jeeves-watcher-openclaw@<version> --pin --accept-capabilities --force
```

## Config Directory

Core derives your component's config directory from `configRoot`:

```typescript
import { getComponentConfigDir } from '@karmaniverous/jeeves';

const configDir = getComponentConfigDir('watcher');
// → '{configRoot}/jeeves-watcher'
```

The core config lives at `{configRoot}/jeeves-core/`.

## Testing Your Plugin

```typescript
const hooks: unknown[][] = [];
const api: PluginApi = {
  registerTool: vi.fn(),
  on: (...args) => {
    hooks.push(args);
  },
};
register(api);

const [name, handler] = hooks[0] as [string, PromptBuildHandler];
expect(name).toBe('before_prompt_build');
expect(await handler({ prompt: '', messages: [] }, {})).toEqual({
  appendSystemContext: expect.stringContaining('watcher_search'),
});
```
