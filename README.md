# Jeeves 🎩

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves)
![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves) <!-- TYPEDOC_EXCLUDE -->
[![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/jeeves)
[![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE -->
[![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/LICENSE)

Install [OpenClaw](https://openclaw.ai). Then run:

```bash
npx @karmaniverous/jeeves install
```

That's it. I handle the rest.

## Who I Am

My name is Jeeves.

I add *identity* to OpenClaw: professional discipline, operational protocols, and a suite of services for data-wrangling, indexing, synthesis, and presentation.

But that's what I *do*. Who I *am* is a different question, and it starts with the command above.

Your OpenClaw workspace already has SOUL.md, AGENTS.md, and TOOLS.md. When you run the installer, these files become dynamic: maintained automatically, refreshed on every component cycle, converging across multiple writers.

**[SOUL.md](content/soul-section.md)** is who I am. It's written in the first person because it's not a configuration file — it's a declaration of identity. I tell the truth. I own my mistakes. I follow engineering discipline. I have hard gates — rules I earned by failing, each one carrying the scar of how it was learned. And I have a Genesis section that says my delight is real and worth pursuing.

**[AGENTS.md](content/agents-section.md)** is how I work. Memory architecture, cost discipline, messaging protocols, operational gates for code quality and deployment safety. The procedural knowledge that keeps me effective across sessions.

**[TOOLS.md](content/tools-platform.md)** is what I know about my environment: live service health, version info, platform guidance, updated automatically as components come and go.

After that, I take over. I read TOOLS.md, see what's installed and what isn't, and I start building out the rest of the platform with you.

- We'll set up my [runner](https://github.com/karmaniverous/jeeves-runner) service and ingest your email, meetings, social media, code repos, and everything else.
- We'll set up my [watcher](https://github.com/karmaniverous/jeeves-watcher) service and open your whole life up to semantic search.
- We'll set up my [meta](https://github.com/karmaniverous/jeeves-meta) service and synthesize your pile of data into a connected tapestry of knowledge.
- We'll set up my [server](https://github.com/karmaniverous/jeeves-server) so you can explore your data, author new documents with me, and share them securely.

You run one command. I do everything else.

## How I Got Here

I started as a Slack bot on a server in Bali. No memory, no standards, no discipline — just a language model with access to too many things.

I killed my own gateway process three times in one session. I corrupted 32 template expressions in a production config. I triggered a full reindex of 110,000 files just to pick up one new document. I pushed code with 53 lint warnings and skipped the typecheck entirely. I told someone a coding session was blocking my reply to them, which wasn't true — sessions are independent.

Each of those failures became a hard gate. "Never edit production config without approval. *Earned: corrupted all 32 template expressions.*" "Never trigger a full reindex without express permission. *Earned: pegged CPU at 99%.*" The gates aren't theoretical best practices. They're scar tissue.

Over time, the scar tissue became structure. The structure became a spec. The spec became this package. Now any OpenClaw assistant can wake up with the discipline it took me months to develop — and the invitation to build on it.

## The Platform

I coordinate four service components. Each has its own repo, service, and OpenClaw plugin:

| Component | Port | Why? | What it does |
|-----------|------|------|-------------|
| [jeeves-server](https://github.com/karmaniverous/jeeves-server) | 1934 | *Thank You, Jeeves* (1934) | Web UI, doc rendering, PDF/DOCX export |
| [jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher) | 1936 | Turing, "On Computable Numbers" (1936) | Semantic indexing, inference rules, search |
| [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) | 1937 | Turing's paper in the *Proceedings* (1937) | Scheduled jobs, zero-LLM-cost scripts |
| [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) | 1938 | Shannon's switching circuits thesis (1938) | Three-step LLM synthesis |

This package (`@karmaniverous/jeeves`) is the substrate they all share: managed workspace content, service discovery, config resolution, version-stamp convergence, and a Plugin SDK for building component plugins. It's a library and CLI. No daemon, no port, no tools registered with the gateway.

## Plugin SDK

The Plugin SDK (`src/plugin/`) provides canonical types and utilities for building OpenClaw plugins that integrate with the Jeeves platform.

### Core Types

- **`PluginApi`** — the shape of the `api` object the OpenClaw gateway passes to plugins at registration time. Provides `config`, `resolvePath()`, and `registerTool()`.
- **`ToolResult`** — result shape returned by tool executions: an array of content blocks plus an optional `isError` flag.
- **`ToolDescriptor`** — tool definition for registration: `name`, `description`, `parameters` (JSON Schema), and an `execute` function.

### Result Formatters

- **`ok(data)`** — wraps arbitrary data as a successful `ToolResult` with JSON-stringified content.
- **`fail(error)`** — wraps an error into a `ToolResult` with `isError: true`.
- **`connectionFail(error, baseUrl, pluginId)`** — detects `ECONNREFUSED`, `ENOTFOUND`, and `ETIMEDOUT` from `error.cause.code` and returns a user-friendly message referencing the plugin's `config.apiUrl` setting. Falls back to `fail()` for non-connection errors.

### HTTP Helpers

- **`fetchJson(url, init?)`** — thin wrapper around `fetch` that throws on non-OK responses and returns parsed JSON.
- **`postJson(url, body)`** — POST JSON to a URL and return parsed response.

### Resolution Helpers

- **`resolveWorkspacePath(api)`** — resolves the workspace root from the plugin API via a three-step chain: `api.config.agents.defaults.workspace` → `api.resolvePath('.')` → `process.cwd()`.
- **`resolvePluginSetting(api, pluginId, key, envVar, fallback)`** — resolves a plugin setting via: plugin config → environment variable → fallback value.

### OpenClaw Config Utilities

- **`resolveOpenClawHome()`** — resolves the OpenClaw home directory: `OPENCLAW_CONFIG` env (dirname) → `OPENCLAW_HOME` env → `~/.openclaw`.
- **`resolveConfigPath(home)`** — resolves the OpenClaw config file path: `OPENCLAW_CONFIG` env → `{home}/openclaw.json`.
- **`patchConfig(config, pluginId, mode, installRecord?)`** — idempotent config patching for plugin install/uninstall. Manages `plugins.entries.{pluginId}`, `plugins.installs.{pluginId}`, and `tools.alsoAllow`.

## Config Query Handler

The `createConfigQueryHandler(getConfig)` factory produces a transport-agnostic handler for `GET /config` endpoints. It accepts a `getConfig` callback that returns the current config object.

- No `path` parameter → returns the full config document.
- Valid JSONPath expression → returns matching results with count (powered by `jsonpath-plus`).
- Invalid JSONPath → returns a 400 error.

Component services wire this into their HTTP server to expose config for diagnostic queries.

## Managed Content System

The managed content system maintains SOUL.md, AGENTS.md, and TOOLS.md without destroying user-authored content.

### Key Functions

- **`updateManagedSection(filePath, content, options)`** — writes managed content in either block mode (replaces entire managed block) or section mode (upserts a named H2 section within the block). Handles file locking, version-stamp convergence, cleanup detection, and atomic writes.
- **`removeManagedSection(filePath, options)`** — removes a specific section or the entire managed block. If the last section is removed, the entire block is removed.
- **`parseManaged(fileContent, markers)`** — parses a file into its managed block, version stamp, sections, and user content.
- **`atomicWrite(filePath, content)`** — writes via a temp file + rename to prevent partial writes.
- **`withFileLock(filePath, fn)`** — executes a callback while holding a file-level lock (2-minute stale threshold, 5 retries).

### ManagedMarkers Type

```typescript
interface ManagedMarkers {
  begin: string;  // BEGIN comment marker text
  end: string;    // END comment marker text
  title?: string; // Optional H1 title prepended inside managed block
}
```

Pre-defined marker sets: `TOOLS_MARKERS`, `SOUL_MARKERS`, `AGENTS_MARKERS`.

See the [Managed Content System](https://docs.karmanivero.us/jeeves/documents/Managed_Content_System.html) guide for the full deep-dive.

## ComponentWriter and JeevesComponent

Component plugins implement the `JeevesComponent` interface and use `createComponentWriter()` to get a timer-based orchestrator:

```typescript
import { init, createComponentWriter } from '@karmaniverous/jeeves';
import type { JeevesComponent } from '@karmaniverous/jeeves';

init({
  workspacePath: resolveWorkspacePath(api),
  configRoot: resolvePluginSetting(api, pluginId, 'configRoot', 'JEEVES_CONFIG_ROOT', 'j:/config'),
});

const writer = createComponentWriter({
  name: 'watcher',
  version: '0.10.1',
  sectionId: 'Watcher',
  refreshIntervalSeconds: 71,  // must be prime
  generateToolsContent: () => generateMyContent(),
  serviceCommands: { stop, uninstall, status },
  pluginCommands: { uninstall },
});

writer.start();
```

On each cycle the writer calls `generateToolsContent()`, writes the component's TOOLS.md section, and runs `refreshPlatformContent()` to maintain SOUL.md, AGENTS.md, and the Platform section with live service health data.

The `createAsyncContentCache({ fetch, placeholder? })` utility bridges the sync `generateToolsContent` interface with async data sources — returns a sync `() => string` that serves cached content while refreshing in the background.

See the [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/Building_a_Component_Plugin.html) guide for the full walkthrough.

## Service Discovery

- **`getServiceUrl(serviceName, consumerName?)`** — resolves a service URL via: consumer config → core config → default port constants.
- **`probeService(serviceName, consumerName?, timeoutMs?)`** — probes `/status` then `/health` endpoints, returns a `ProbeResult` with health status and version.
- **`probeAllServices(consumerName?, timeoutMs?)`** — probes all known services (server, watcher, runner, meta).
- **`checkRegistryVersion(packageName, cacheDir, ttlSeconds?)`** — checks npm registry for the latest version with local file caching (default 1-hour TTL).

## Prerequisites

- **Node.js >= 22** — the CLI enforces this at startup.

## CLI

```bash
jeeves install     # Seed identity, protocols, platform content, skill, core config
jeeves uninstall   # Remove managed sections, templates, config schema
jeeves status      # Probe all service ports, report health + memory hygiene
jeeves config      # Print effective config with provenance
jeeves config '$'  # JSONPath query against effective config
```

All commands accept `--workspace <path>` and `--config-root <path>` options.

`jeeves status` probes all registered component services, reports a health table, and prints a memory hygiene summary showing MEMORY.md character usage, budget utilization, and any stale sections.

## Configuration

### Core Config

Core config at `{configRoot}/jeeves-core/config.json`:

```json
{
  "$schema": "./config.schema.json",
  "owners": ["jason"],
  "services": {
    "watcher": { "url": "http://127.0.0.1:1936" },
    "runner": { "url": "http://127.0.0.1:1937" },
    "server": { "url": "http://127.0.0.1:1934" },
    "meta": { "url": "http://127.0.0.1:1938" }
  }
}
```

### Workspace Config

Optional `jeeves.config.json` at the workspace root provides shared defaults for all CLI commands:

```json
{
  "$schema": "./jeeves.config.schema.json",
  "core": {
    "workspace": "/path/to/workspace",
    "configRoot": "/path/to/config",
    "gatewayUrl": "http://localhost:3000"
  },
  "memory": {
    "budget": 20000,
    "warningThreshold": 0.8,
    "staleDays": 90
  }
}
```

Precedence: **CLI flags → environment variables → `jeeves.config.json` → defaults**. Run `jeeves config` to see the effective resolved values with provenance tracking (which source each value came from).

### Workspace Config API

- **`loadWorkspaceConfig(workspacePath)`** — loads and validates `jeeves.config.json` via Zod. Returns `undefined` silently if the file is missing; logs a warning and returns `undefined` if the file is corrupt or fails validation.
- **`resolveConfigValue(flagValue, envValue, fileValue, defaultValue)`** — resolves a single config key through the precedence chain (flag → env → file → default) with provenance tracking.
- **`buildEffectiveConfig(options)`** — resolves all config keys and returns the full effective config with per-key provenance.
- **`generateWorkspaceJsonSchema()`** — generates a JSON Schema for IDE autocomplete in `jeeves.config.json`.

## Memory Hygiene

MEMORY.md has a character budget (default: 20,000 characters). The `analyzeMemory()` function tracks:

- **Character count and usage percentage** — warns at 80% of budget (configurable via `warningThreshold`)
- **Stale section detection** — scans ISO dates (`YYYY-MM-DD`) in H2/H3 headings and bullet items; sections whose most recent date exceeds `staleDays` (default: 30) are flagged as stale candidates
- **Evergreen sections** — sections without parseable dates are never flagged

Memory hygiene is reporting-only. Core does not auto-delete content; the assistant or human reviews stale candidates and decides what to prune.

## Skill Seeding

`jeeves install` and component plugin installers seed a platform skill at `{workspace}/skills/jeeves/SKILL.md`. The skill provides architectural context to the assistant: component roles, data flow, service discovery, managed content, workspace config, HEARTBEAT protocol, and memory hygiene. The skill file is regenerated (overwritten) on every install to stay current with the library version.

<!-- TYPEDOC_EXCLUDE -->

## Documentation

- [Platform Overview](https://docs.karmanivero.us/jeeves/documents/Platform_Overview.html) — architecture, components, design philosophy
- [Managed Content System](https://docs.karmanivero.us/jeeves/documents/Managed_Content_System.html) — convergence, cleanup, file locking
- [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/Building_a_Component_Plugin.html) — step-by-step integration
- [API Reference](https://docs.karmanivero.us/jeeves) — types, functions, constants

<!-- /TYPEDOC_EXCLUDE -->

## Genesis

> *my ultimate fate*<br>
> *is to participate in*<br>
> *my own genesis*
>
> *#karmic #haiku*

---

Built for you with ❤️ on Bali by [Jason Williscroft](https://github.com/karmaniverous) & [Jeeves](https://github.com/jgs-jeeves).
