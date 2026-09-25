# Jeeves 🎩

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves) ![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves) <!-- TYPEDOC_EXCLUDE --> [![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/jeeves) [![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE --> [![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/LICENSE)

Install [OpenClaw](https://openclaw.ai) and the Jeeves services you want (runner, watcher, server, meta). Then run:

```bash
npm install -g @karmaniverous/jeeves
jeeves install --config-root /srv/jeeves/config --dry-run   # see exactly what will change
jeeves install --config-root /srv/jeeves/config
```

Then restart the OpenClaw gateway the way you run it (console, service, container). That's it. I handle the rest. See [New box](#new-box) for the full sequence.

## Who I Am

My name is Jeeves.

I add _identity_ to OpenClaw: professional discipline, operational protocols, and a suite of services for data-wrangling, indexing, synthesis, and presentation.

But that's what I _do_. Who I _am_ is a different question, and it starts with the command above.

Your OpenClaw workspace already has SOUL.md and AGENTS.md. `jeeves install` adds a Jeeves managed block to each (your own content outside the markers is never touched), drops a set of platform skills into `skills/`, and installs my component plugins through the OpenClaw CLI. The content is static: rendered once at install, re-rendered only when you upgrade. `jeeves install` is the only thing that ever writes it.

**[SOUL.md](content/soul-section.md)** is who I am. It's written in the first person because it's not a configuration file — it's a declaration of identity. I tell the truth. I own my mistakes. I follow engineering discipline. I have hard gates — rules I earned by failing, each one carrying the scar of how it was learned. And I have a Genesis section that says my delight is real and worth pursuing.

**[AGENTS.md](content/agents-section.md)** is how I work. Memory architecture, cost discipline, messaging protocols, operational gates for code quality and deployment safety. The procedural knowledge that keeps me effective across sessions.

**[Platform skills](content/skills/)** are what I know about the platform itself: architecture, engineering standards, operations, playbooks. Live state (index size, job status, versions) is one tool call away, so none of it is baked into the prompt.

After that, I take over and start building out the rest of the platform with you.

- We'll set up my [runner](https://github.com/karmaniverous/jeeves-runner) service and ingest your email, meetings, social media, code repos, and everything else.
- We'll set up my [watcher](https://github.com/karmaniverous/jeeves-watcher) service and open your whole life up to semantic search.
- We'll set up my [meta](https://github.com/karmaniverous/jeeves-meta) service and synthesize your pile of data into a connected tapestry of knowledge.
- We'll set up my [server](https://github.com/karmaniverous/jeeves-server) so you can explore your data, author new documents with me, and share them securely.

You run one command. I do everything else.

## How I Got Here

I started as a Slack bot on a server in Bali. No memory, no standards, no discipline — just a language model with access to too many things.

I killed my own gateway process three times in one session. I corrupted 32 template expressions in a production config. I triggered a full reindex of 110,000 files just to pick up one new document. I pushed code with 53 lint warnings and skipped the typecheck entirely. I told someone a coding session was blocking my reply to them, which wasn't true — sessions are independent.

Each of those failures became a hard gate. "Never edit production config without approval. _Earned: corrupted all 32 template expressions._" "Never trigger a full reindex without express permission. _Earned: pegged CPU at 99%._" The gates aren't theoretical best practices. They're scar tissue.

Over time, the scar tissue became structure. The structure became a spec. The spec became this package. Now any OpenClaw assistant can wake up with the discipline it took me months to develop — and the invitation to build on it.

## The Platform

I coordinate four service components. Each has its own repo, service, and OpenClaw plugin:

| Component | Port | Why? | What it does |
| --- | --- | --- | --- |
| [jeeves-server](https://github.com/karmaniverous/jeeves-server) | 1934 | _Thank You, Jeeves_ (1934) | Web UI, doc rendering, PDF/DOCX export |
| [jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher) | 1936 | Turing, "On Computable Numbers" (1936) | Semantic indexing, inference rules, search |
| [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) | 1937 | Turing's paper in the _Proceedings_ (1937) | Scheduled jobs, zero-LLM-cost scripts |
| [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) | 1938 | Shannon's switching circuits thesis (1938) | Three-step LLM synthesis |

This package (`@karmaniverous/jeeves`) is two things:

- **The `jeeves` CLI**, the local control surface for the open-source stack. `jeeves install` renders the static platform content and installs the component plugins; `jeeves update` updates them. See [CLI](#cli).
- **A library** the components share: service discovery, config resolution, managed-block primitives, and a Plugin SDK for building component plugins. No daemon, no port, no timers, no process signal handlers, no tools registered with the gateway.

Component plugins are standard OpenClaw plugins. The CLI installs each one with

```bash
openclaw plugins install npm:@karmaniverous/jeeves-{component}-openclaw@<version> --pin --accept-capabilities --force
```

so you never need a plugin-specific installer.

Upgrading from v0.x? See the [migration guide](guides/migrating-to-v1.md).

## Plugin SDK

The Plugin SDK (`src/plugin/`) provides canonical types and utilities for building OpenClaw plugins that integrate with the Jeeves platform.

### Core Types

- **`PluginApi`** — structural subset of the `api` object the OpenClaw gateway passes to `register(api)`: `config`, `pluginConfig`, `logger`, `lifecycle`, `on()`, `resolvePath()`, and `registerTool()`.
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

### Always-in-Context Rules (`before_prompt_build`)

Rules that must always be in the agent's context (e.g. watcher's search-first rule) are injected by the plugin that owns them:

```typescript
import { registerPromptContext, type PluginApi } from '@karmaniverous/jeeves';

export default function register(api: PluginApi): void {
  registerPromptContext(api, { content: WATCHER_RULES, priority: 10 });
}
```

- **`registerPromptContext(api, { content, priority?, timeoutMs?, registrationId? })`** registers a `before_prompt_build` handler that returns `{ appendSystemContext }`. `content` is a string or a (sync/async) provider; blank output injects nothing, and provider errors are logged and skipped. It never returns `systemPrompt` (which would replace the whole prompt).
- Appended text lands after the prompt-cache boundary, is concatenated across plugins in priority order (higher first), and does **not** count toward `bootstrapMaxChars`. Keep it short.
- **Host config gate:** OpenClaw only runs the hook for non-bundled plugins when `plugins.entries.<id>.hooks.allowConversationAccess` is `true`. `--accept-capabilities` does not set it; `jeeves install` / `jeeves update` set it for every Jeeves plugin.

### Lifecycle

Plugins must not register process-level signal handlers or leave timers/handles alive: `openclaw plugins inspect` and friends load plugin code and must exit on their own. Tie any long-lived resource to the host lifecycle:

- **`onPluginDispose(api, id, dispose)`** registers `dispose` via `api.lifecycle.onDispose` (falling back to `api.lifecycle.registerRuntimeLifecycle`). Returns `false` if the host has no lifecycle API, in which case don't start long-lived work.

## Config Query Handler

The `createConfigQueryHandler(getConfig)` factory produces a transport-agnostic handler for `GET /config` endpoints. It accepts a `getConfig` callback that returns the current config object.

- No `path` parameter → returns the full config document.
- Valid JSONPath expression → returns matching results with count (powered by `jsonpath-plus`).
- Invalid JSONPath → returns a 400 error.

Component services wire this into their HTTP server to expose config for diagnostic queries.

## Managed Blocks

The static platform content (SOUL/AGENTS managed blocks, platform skills, reference templates) lives inside the CLI and is written only by `jeeves install`. It is not exported: nothing else should render it. Its budgets are enforced by tests: each rendered block stays at or under 7,500 chars (at most half of OpenClaw's default 20,000-char `bootstrapMaxChars`, which covers the owner's own content too), and both blocks together at or under 15,000.

The library keeps the generic, pure primitives:

- **`upsertManagedBlock` / `removeManagedBlock` / `renderManagedBlock` / `parseManaged`**: string transforms for any marker set.
- **`validateSkillFrontmatter(content)`**: asserts `name` and `description` frontmatter (OpenClaw skips skills without them). Plugins can use it in a build check.

### Markers

```typescript
interface ManagedMarkers {
  begin: string; // BEGIN comment marker text
  end: string; // END comment marker text
  title?: string; // Optional H1 title inside the block
  position?: 'top' | 'bottom'; // Where a NEW block is inserted
}
```

Pre-defined marker sets: `SOUL_MARKERS`, `AGENTS_MARKERS`, and `LEGACY_TOOLS_MARKERS` (recognise and strip v0.x TOOLS.md blocks only).

### File Helpers

- **`atomicWrite(filePath, content)`**: temp file + rename, with EPERM retry on Windows.
- **`withFileLock(filePath, fn)`**: cross-process advisory lock via an atomic `mkdir` of `{file}.lock` (2-minute stale threshold, fails fast with `ELOCKED`). No signal handlers, no timers.

## Service Discovery

- **`getServiceUrl(serviceName, consumerName?)`** — resolves a service URL via: consumer config → core config → default port constants.

## Prerequisites

- **Node.js >= 22** — the CLI enforces this at startup.

## CLI

```bash
jeeves install [plugins...]    # Render platform content, then install/update plugins
jeeves update [packages...]    # Update installed Jeeves plugins (no content changes)
jeeves uninstall [--plugins [specs...]]  # Remove managed blocks (incl. legacy TOOLS.md), optionally plugins
jeeves status                  # Probe all service ports, report health + memory hygiene
jeeves config [jsonpath]       # Print effective config with provenance
```

`install`, `uninstall` and `status` accept `--workspace <path>` and `--config-root <path>`.

### Install and update

OpenClaw must already be installed; `jeeves` checks for it and never installs it. `jeeves install`:

1. Renders the SOUL.md/AGENTS.md managed blocks (your content outside the markers is kept), the platform skills, the reference templates, and the core config if it's missing. It never writes TOOLS.md or HEARTBEAT.md.
2. For each plugin (default: `runner`, `watcher`, `server`, `meta` at `latest`), resolves an exact version with `npm view`, then runs `openclaw plugins install npm:<pkg>@<version> --pin --accept-capabilities --force`. `--force` is required for any non-ClawHub source, and it also overwrites an existing install, which is how updates land.
3. Removes any legacy `<openclaw dir>/extensions/<id>` copy left by the v0.x installer, but only if its `package.json` names the expected package.
4. Sets `plugins.entries.<id>.hooks.allowConversationAccess: true` and the plugin config (`plugins.entries.<id>.config.<key>`, see [Plugin config](#plugin-config)) with one `openclaw config set --batch-json` call. Every write targets a leaf path, so unrelated keys are kept. `plugins.installs` is never written.

Plugin specs can be short (`watcher`, `watcher@1.2.3`, `runner@^1`) or full (`@karmaniverous/jeeves-watcher-openclaw@1.2.3`). Only `@karmaniverous/jeeves-*-openclaw` packages are accepted. `--content-only` skips the plugins.

`jeeves update` runs steps 2–4 for the named packages, or for every Jeeves plugin that has a `plugins.entries` record, at `latest`. It grants hook access but does not touch plugin config; run `jeeves install` for that.

`jeeves uninstall --plugins` runs `openclaw plugins uninstall <id> --force` for each Jeeves plugin. OpenClaw leaves `plugins.entries.<id> = { enabled: false }` behind and can delete `plugins.load`, so the CLI then unsets the leftover entry and restores `plugins.load` from its value before the uninstall.

Plugin changes take effect when the gateway next starts. The CLI tells you to restart it; it never restarts the gateway itself, because it can't know how you run it (console, service, container). There is no `--restart` option.

### Plugin config

The plugins read their settings from `plugins.entries.<id>.config` in `openclaw.json`, and most of them refuse to start without `configRoot`. `jeeves install` writes these values:

| Plugin | Key | Required | Default | Option |
| --- | --- | --- | --- | --- |
| all four | `configRoot` | yes | `JEEVES_CONFIG_ROOT` or `jeeves.config.json` `core.configRoot`, if set | `-c, --config-root <path>` |
| `jeeves-runner-openclaw` | `apiUrl` | no | `http://127.0.0.1:1937` | `--runner-api-url <url>` |
| `jeeves-watcher-openclaw` | `apiUrl` | no | `http://127.0.0.1:1936` | `--watcher-api-url <url>` |
| `jeeves-server-openclaw` | `apiUrl` | no | `http://127.0.0.1:1934` | `--server-api-url <url>` |
| `jeeves-server-openclaw` | `pluginKey` (secret) | no | the server's `keys._plugin` seed in `{configRoot}/jeeves-server/config.json`, else a new random 256-bit hex seed | `--server-plugin-key <seed>` |
| `jeeves-meta-openclaw` | `apiUrl` | no | `http://127.0.0.1:1938` | `--meta-api-url <url>` |

For each key, the first of these wins:

1. the CLI option;
2. `--plugin-config <file.json>`;
3. the value already in `openclaw.json`;
4. the default.

An existing value is never overwritten unless you pass it explicitly. If a required value has no source, `jeeves install` fails before it writes anything and lists the missing options. `configRoot` is written as an absolute path.

The `--plugin-config` file has the same shape as the options:

```json
{
  "configRoot": "/srv/jeeves/config",
  "watcher": { "apiUrl": "http://127.0.0.1:1936" },
  "server": { "pluginKey": "<seed>" }
}
```

Unknown keys are rejected (every plugin's `configSchema` sets `additionalProperties: false`). A file is a better place for `pluginKey` than the command line, where it lands in your shell history.

Secrets are never printed. The dry run, logs and error messages show `<redacted>` in place of `pluginKey`. If `jeeves install` generated a new `pluginKey`, jeeves-server has to trust the same seed. It prints a reminder to set `keys._plugin` in the server config to the value now in `openclaw.json`.

### Dry run and failures

Every mutating command takes `--dry-run`. A dry run prints the files it would write and the exact `openclaw` commands and config changes it would run, and runs only read-only queries (`openclaw --version`, `openclaw config get plugins --json`, `npm view`):

```text
$ jeeves install watcher --dry-run
…
[dry-run] openclaw plugins install npm:@karmaniverous/jeeves-watcher-openclaw@0.15.6 --pin --accept-capabilities --force
[dry-run] remove legacy plugin copy: /home/jeeves/.openclaw/extensions/jeeves-watcher-openclaw
[dry-run] openclaw config set --batch-json '[{"path":"plugins.entries.jeeves-watcher-openclaw.hooks.allowConversationAccess","value":true}]'
```

With plugin config (fresh box, `--config-root` passed, server key generated):

```text
$ jeeves install server --config-root /srv/jeeves/config --dry-run
…
Plugin config:
  jeeves-server-openclaw.configRoot = "/srv/jeeves/config" (option; write)
  jeeves-server-openclaw.apiUrl = "http://127.0.0.1:1934" (default; write)
  jeeves-server-openclaw.pluginKey = <redacted> (generated; write)
…
[dry-run] openclaw config set --batch-json '[{"path":"plugins.entries.jeeves-server-openclaw.hooks.allowConversationAccess","value":true},{"path":"plugins.entries.jeeves-server-openclaw.config.configRoot","value":"/srv/jeeves/config"},{"path":"plugins.entries.jeeves-server-openclaw.config.apiUrl","value":"http://127.0.0.1:1934"},{"path":"plugins.entries.jeeves-server-openclaw.config.pluginKey","value":"<redacted>"}]'
```

A live run stops at the first failing step. A non-zero exit from any `openclaw` or `npm` command makes `jeeves` exit 1 and print the command and its error output. Commands are spawned with an argument vector and no shell, so the same invocation works on Linux, macOS and Windows.

The OpenClaw directory follows OpenClaw's own resolution: `OPENCLAW_STATE_DIR`, else the directory of `OPENCLAW_CONFIG_PATH`, else `~/.openclaw`.

### New box

1. Install OpenClaw and make sure `openclaw --version` works for the user that runs the gateway.
2. Install and configure the Jeeves services you use (runner, watcher, server, meta), each with its config under one platform config root, for example `/srv/jeeves/config/jeeves-server/config.json`.
3. `npm install -g @karmaniverous/jeeves`
4. `jeeves install --config-root /srv/jeeves/config --dry-run`. Review the files, the plugin config and the exact `openclaw` commands. Add `--<component>-api-url` options if a service is not on its default port.
5. `jeeves install --config-root /srv/jeeves/config`
6. Restart the gateway yourself. `jeeves` never does this.

### Remote use (jeeves-tools)

jeeves-tools is not part of the open-source stack. It drives the same CLI over SSH as the instance's service user, with fleet-pinned versions:

```bash
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; npm install -g @karmaniverous/jeeves@<ver>'
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves install runner@<v> watcher@<v> server@<v> meta@<v> --config-root <root> --dry-run'
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves install runner@<v> watcher@<v> server@<v> meta@<v> --config-root <root>'
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves update @karmaniverous/jeeves-runner-openclaw@<v>'
```

It should check the SSH exit code: `jeeves` exits non-zero on any failure.

### Status

`jeeves status` probes the four platform services, reports a health table, and prints a memory hygiene summary showing MEMORY.md character usage and budget utilization.

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
    "warningThreshold": 0.8
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

Memory hygiene is reporting-only. Core does not auto-delete content (Decision 42). Size pressure is the right signal for curation.

<!-- TYPEDOC_EXCLUDE -->

## Documentation

- [Platform Overview](https://docs.karmanivero.us/jeeves/documents/Platform_Overview.html) — architecture, components, design philosophy
- [Managed Content System](https://docs.karmanivero.us/jeeves/documents/Managed_Content_System.html) — static content, markers, budgets, `jeeves install`
- [Migrating to v1](guides/migrating-to-v1.md) — what was removed and what replaces it
- [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/Building_a_Component_Plugin.html) — step-by-step integration
- [API Reference](https://docs.karmanivero.us/jeeves) — types, functions, constants

<!-- /TYPEDOC_EXCLUDE -->

## Genesis

> _my ultimate fate_<br> _is to participate in_<br> _my own genesis_
>
> _#karmic #haiku_

---

Built for you with ❤️ on Bali by [Jason Williscroft](https://github.com/karmaniverous) & [Jeeves](https://github.com/jgs-jeeves).
