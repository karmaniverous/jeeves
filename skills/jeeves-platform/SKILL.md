---
name: jeeves-platform
description: >
  Jeeves platform architecture, data flow, component interaction, and coordination knowledge. Use when making architectural decisions, coordinating across components, checking platform health, or managing service lifecycle.
---

# Jeeves Platform Skill

## Platform Architecture

Jeeves is a four-component platform coordinated by a shared library (`@karmaniverous/jeeves`):

| Component | Role | Port |
| --- | --- | --- |
| **jeeves-runner** | Execute: scheduled jobs, SQLite state, HTTP API | 1937 |
| **jeeves-watcher** | Index: file→Qdrant semantic indexing, inference rules | 1936 |
| **jeeves-server** | Present: web UI, file browser, doc render, export | 1934 |
| **jeeves-meta** | Distill: LLM synthesis, .meta/ directories, scheduling | 1938 |

Core (`@karmaniverous/jeeves`) is a **library + CLI**, not a service. No port.

## Data Flow

```
Files → Watcher (index) → Qdrant → Meta (synthesize) → .meta/ → Watcher (re-index)
                                                                      ↓
Runner (schedule) → Scripts → Services ← Server (present) ← Browser
```

## Component Interaction

- **Watcher** indexes files into Qdrant with inference rules and enrichments.
- **Meta** reads from Qdrant, synthesizes `.meta/` directories, which watcher re-indexes.
- **Runner** executes scheduled scripts that may call any service's HTTP API.
- **Server** presents files, renders documents, and provides the event gateway.
- **Core** is the `jeeves` CLI (writes the SOUL.md and AGENTS.md managed blocks, installs and updates the component plugins) plus a library the components share: service discovery, config resolution, managed-block primitives, and the plugin SDK. Core has no daemon, port or timers, and registers no tools with the gateway.

## Service Discovery

Services find each other via config resolution:

1. Component's own config file (`{configRoot}/jeeves-{name}/config.json`)
2. Core config file (`{configRoot}/jeeves-core/config.json`)
3. Default port constants

## Managed Content System

`jeeves install` writes static managed blocks into workspace files using comment markers:

- **SOUL.md** — Professional discipline and behavioral foundations (block mode)
- **AGENTS.md** — Operational protocols and memory architecture (block mode)

These are the only managed blocks core writes. OpenClaw (2026.9.6+) loads only AGENTS.md, SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md, and MEMORY.md into the prompt. TOOLS.md and HEARTBEAT.md are not loaded, so nothing written there reaches the model: put agent-facing guidance in AGENTS.md.

`jeeves install` is the only writer. Each run replaces the whole block and keeps your content outside the markers. Nothing rewrites the blocks at runtime (no plugin or service touches them), and there is no cleanup detection or escalation. `jeeves uninstall` removes both blocks (and any legacy TOOLS.md block). Skills are not written by core: each plugin ships its own skill.

## Workspace Configuration

Core reads shared defaults from `jeeves.config.json` in the workspace root:

- Precedence: CLI flags → env vars (`JEEVES_WORKSPACE`, `JEEVES_CONFIG_ROOT`, `JEEVES_GATEWAY_URL`, `JEEVES_MEMORY_BUDGET`, `JEEVES_MEMORY_WARNING_THRESHOLD`) → file → defaults
- Namespaced: `core.*` (workspace, configRoot, gatewayUrl, devRepos) and `memory.*` (budget, warningThreshold)
- Inspect with `jeeves config [jsonpath]`

**Managed instances:** the instance layout (paths, units, ports, config locations, restarts, what deploy overwrites) is in the `jeeves-platform-managed` skill, which managed instances get alongside this one.

## Recurring Checklists

Core does not write HEARTBEAT.md, and OpenClaw (2026.9.6+) never reads it. A recurring checklist for heartbeat runs lives in the heartbeat monitor's cron scratch (`openclaw cron scratch <jobId> --set "..."`); recurring work that needs its own cadence is an automation job. Check component health on demand with `jeeves status`.

## Plugin Lifecycle

The component plugins are standard OpenClaw plugins, installed and updated only through the `jeeves` CLI (`npm install -g @karmaniverous/jeeves`). There are no per-plugin installers. OpenClaw must already be installed.

```bash
# Preview: files, plugin config, exact openclaw commands (read-only)
jeeves install --config-root <root> --dry-run

# Managed blocks + runner/watcher/server/meta plugins (default: latest; pin with watcher@1.2.3)
jeeves install --config-root <root>

# Update installed Jeeves plugins (or named ones) and fill in missing plugin config; no content changes
jeeves update
jeeves update watcher@1.2.3

# Remove managed blocks and artifacts, then uninstall every Jeeves plugin
jeeves uninstall

# After any OpenClaw upgrade: re-apply the dist patches (install/update run this too)
jeeves patch-openclaw --dry-run
jeeves patch-openclaw
```

- **Install/update:** each plugin is installed with `openclaw plugins install npm:<pkg>@<ver> --pin --accept-capabilities --force`. A plugin already at that exact version is skipped (`--force-reinstall` overrides). Leftover v0.x `extensions/<id>` copies are removed.
- **Plugin config** (`plugins.entries.<id>.config`): `configRoot` is required for all four (`--config-root`, `--plugin-config <file.json>`, the existing value, then `JEEVES_CONFIG_ROOT` or `jeeves.config.json`); a missing one fails before anything changes. `apiUrl` defaults to the service's local port (`--<component>-api-url` overrides). The server `pluginKey` is kept equal to `keys._plugin` in `{configRoot}/jeeves-server/config.json` on both ends; `--server-plugin-key` resolves a conflict. Existing values are kept unless passed explicitly; secrets appear only as `<redacted>`.
- **Conversation hooks:** `hooks.allowConversationAccess` is granted only to plugins that declare conversation hooks (`jeeves.conversationHooks` in their `package.json`). Without the grant OpenClaw skips hooks such as `before_prompt_build`.
- **`--dry-run`** on install, update and uninstall prints everything it would do and changes nothing.
- **OpenClaw patches:** `jeeves patch-openclaw` re-applies Jeeves' OpenClaw dist patches (`--skip-patch` skips them in install/update). It exits non-zero when a patch site isn't found (e.g. an unsupported OpenClaw version) and must run as the user who owns the OpenClaw install.
- **Restart yourself.** Plugin changes and dist patches take effect when the gateway next starts; the CLI never restarts it (or jeeves-server, if it updated `keys._plugin`). Restart jeeves-server with `server_service` (action `restart`); restarting the gateway needs owner approval and must be the last action.
- Installed plugins and versions: `openclaw plugins inspect --all --json`. Service health: `jeeves status`.

## Memory Hygiene

MEMORY.md has a character budget (default 20,000). Core tracks:

- Character count and usage percentage
- Warning at 80% of budget (`memory.warningThreshold`)

Review is human/agent-mediated — core does not auto-delete.

`jeeves status` reports the MEMORY.md character count against the budget (OK, warning, or over budget). Core writes no memory alerts to any workspace file.

## Workspace File Size Limits

OpenClaw truncates each workspace bootstrap file (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, BOOTSTRAP.md, MEMORY.md) at `agents.defaults.bootstrapMaxChars` (default 20,000 chars). Files over the limit are silently truncated. Core writes no size alerts to any workspace file, so check a file's size when you edit it.

When a bootstrap file nears the limit, trim in this order: (1) move domain-specific content to a local skill, (2) extract reference material to companion files with a pointer, (3) summarize verbose instructions, (4) remove stale content.
