---
title: Platform Overview
---

# Platform Overview

Jeeves is an identity and data services layer for [OpenClaw](https://openclaw.ai). OpenClaw provides the gateway, sessions, tools, and messaging. Jeeves adds professional discipline, operational protocols, and a suite of services for ingesting, indexing, synthesizing, and presenting your data.

## Core Principle

**Separation of mechanical and intelligent work.** Scripts handle data fetching, parsing, and transformation at zero LLM cost. The AI is invoked only when reasoning is required: synthesis, drafting, decision support.

## Components

The platform consists of four service components plus this shared library:

### jeeves-server (port 1934)

Web UI for document browsing, Markdown rendering, PDF/DOCX export, and webhook event gateway. Serves files from the filesystem with authentication via Google (insiders) or HMAC share links (outsiders).

### jeeves-watcher (port 1936)

Filesystem watcher that maintains a synchronized Qdrant vector store. Extracts text from multiple formats, generates embeddings, applies configurable inference rules for metadata classification, and exposes a semantic search API.

### jeeves-runner (port 1937)

Scheduled job execution engine backed by SQLite. Runs Node.js process scripts on cron schedules without LLM involvement. Only synthesis jobs invoke the AI (via OpenClaw Gateway API).

### jeeves-meta (port 1938)

Knowledge synthesis engine that discovers `.meta/` directories in the filesystem, gathers context from the vector index, and uses a three-step LLM process (architect, builder, critic) to produce structured synthesis artifacts.

### @karmaniverous/jeeves (this package)

Shared library and CLI that provides the substrate all components build on:
- **Managed content system** — maintains SOUL.md, AGENTS.md, TOOLS.md with version-stamp convergence, file locking, and cleanup detection
- **Plugin SDK** — canonical types (`PluginApi`, `ToolResult`, `ToolDescriptor`), result formatters (`ok`/`fail`/`connectionFail`), HTTP helpers (`fetchJson`/`postJson`), resolution utilities (`resolveWorkspacePath`/`resolvePluginSetting`), and OpenClaw config patching (`patchConfig`)
- **Config query handler** — transport-agnostic JSONPath query support for service `GET /config` endpoints
- **Service discovery** — URL resolution, health probing, and npm registry version checks
- **ComponentWriter** — timer-based orchestrator for managed content writes
- **Content seeding** — CLI commands to bootstrap and tear down platform content

## How Components Interact

![Platform Data Flow](../diagrams/out/platform-data-flow.png)

1. **Runner** executes scheduled jobs that fetch, transform, and write domain data to the filesystem
2. **Watcher** detects file changes, extracts text, generates embeddings, and indexes into Qdrant
3. **Server** serves files via web UI for human browsing and sharing
4. **Meta** queries the vector index, synthesizes knowledge, and writes output back to the filesystem
5. **The AI assistant** (via OpenClaw) uses watcher's search and runner's job outputs to reason and respond

## Content Lifecycle

The platform maintains three workspace files that form the assistant's identity and operational context:

### SOUL.md

Professional discipline, hard gates, and genesis orientation. Written in block mode — core owns the entire managed block. The assistant reads this at session start to know who it is.

### AGENTS.md

Memory architecture, cost discipline, messaging protocols, and operational gates. Also written in block mode. The assistant reads this to know how to operate.

### TOOLS.md

Live platform state written in section mode. Multiple components each contribute an H2 section:

| Section | Written By | Content |
|---------|-----------|---------|
| Platform | All (via `refreshPlatformContent`) | Service health table, version info, platform guidance |
| Watcher | jeeves-watcher-openclaw | Index stats, search configuration, indexed paths |
| Server | jeeves-server-openclaw | Export capabilities, connected services |
| Runner | jeeves-runner-openclaw | Job status, active scripts |
| Meta | jeeves-meta-openclaw | Synthesis entity summary, tools reference |

Sections always appear in stable order (Platform → Watcher → Server → Runner → Meta) regardless of write sequence.

## Version-Stamp Convergence

Each component plugin bundles its own copy of `@karmaniverous/jeeves`. When plugins have different library versions, they independently write the same shared content (SOUL.md, AGENTS.md, Platform section). The version stamp in the BEGIN marker prevents oscillation:

- **My version ≥ stamped version** → write (I'm current or newer)
- **My version < stamped, stamp is fresh** → skip (a newer version is maintaining this)
- **My version < stamped, stamp is stale (>5 min)** → write (the newer plugin was probably uninstalled)

This means the highest-version plugin "wins" without any coordination protocol. See the [Managed Content System](./managed-content-system.md) guide for details.

## Component Versions State File

Each `ComponentWriter` cycle writes its component's version entry to `{coreConfigDir}/component-versions.json`. This shared state file tracks:

```typescript
interface ComponentVersionEntry {
  serviceVersion?: string;   // From health probe response
  pluginVersion?: string;    // The OpenClaw plugin package version
  servicePackage?: string;   // npm package name for the service
  pluginPackage?: string;    // npm package name for the plugin
  updatedAt: string;         // ISO timestamp of last update
}
```

The Platform section template reads this file to populate ALL rows in the service health table, not just the calling component's. This means any component's writer cycle produces a complete, up-to-date Platform section.

## Service Health Probing

On each writer cycle, `refreshPlatformContent` calls `probeAllServices()` which probes all four services by name (server, watcher, runner, meta):

1. Resolve the service URL via `getServiceUrl`: consumer config → core config → default port (`DEFAULT_PORTS`)
2. HTTP GET to `/status`, then `/health` as fallback
3. Extract `version` from the JSON response body if available
4. Return a `ProbeResult` with `name`, `port`, `healthy`, and optional `version`

Probe timeout defaults to 3 seconds. Results are merged with component version entries and rendered into the Platform section's service health table.

## Registry Version Checks

The platform checks npm for newer versions of each component's service and plugin packages using `checkRegistryVersion()`:

1. Check a local cache file (`registry-cache.json`) in the component's config directory
2. If the cache is stale (default: 1-hour TTL), run `npm view {package} version`
3. Compare using `semver.gt()` — only flag genuinely newer versions
4. Display update arrows (⬆) in the Platform service health table

This uses proper semver comparison, not string comparison, so pre-release versions and version ranges are handled correctly.

## The Team

Jeeves isn't just software — he works with people. On any given day, Jeeves might be helping an author track his book sales, briefing a QA lead on regression testing, onboarding a new team member to a private members' club, or pair-programming a platform spec with his developer. Each interaction shapes who he becomes. The hard gates in SOUL.md aren't hypothetical — they were earned in real conversations with real people who trusted him with real work.

## Architecture

![Component Architecture](../diagrams/out/component-architecture.png)

Each component plugin bundles its own copy of `@karmaniverous/jeeves` as a regular dependency. No shared singleton, no install-order constraints. Version skew is managed via semver and version-stamp convergence.

## Port Assignments

| Port | Year | Significance |
|------|------|-------------|
| 1934 | 1934 | Wodehouse: *Thank You, Jeeves* — first full Jeeves novel |
| 1936 | 1936 | Turing: "On Computable Numbers" — theoretical foundation of computing |
| 1937 | 1937 | Turing's paper published in *Proceedings of the London Mathematical Society* |
| 1938 | 1938 | Shannon: "A Symbolic Analysis of Relay and Switching Circuits" |

## File Organization

```
{configRoot}/
  jeeves-core/                ← Core config + templates
    config.json               ← Service URLs, owners
    config.schema.json        ← JSON Schema for IDE autocomplete
    component-versions.json   ← Shared version state (all components)
    registry-cache.json       ← npm version cache
    templates/                ← Spec skeleton, dev practice guide
  jeeves-watcher/             ← Watcher-specific config
  jeeves-runner/              ← Runner-specific config
  jeeves-server/              ← Server-specific config
  jeeves-meta/                ← Meta-specific config

{workspace}/
  SOUL.md                     ← Professional discipline (managed + user sections)
  AGENTS.md                   ← Operational protocols (managed + user sections)
  TOOLS.md                    ← Live platform state (managed + user sections)
```

## HEARTBEAT Health Orchestration

The HEARTBEAT system maintains a `# Jeeves Platform Status` heading in HEARTBEAT.md with per-component subsections. Each component follows a state machine:

`not_installed → deps_missing → config_missing → service_not_installed → service_stopped → healthy`

On each `ComponentWriter` cycle, `runHeartbeatCycle()`:

1. Reads existing HEARTBEAT.md and parses declined headings
2. Runs `orchestrateHeartbeat()` — probes all components through the state machine
3. Checks memory hygiene (budget warnings)
4. Checks workspace file health (SOUL.md, AGENTS.md, TOOLS.md size)
5. Writes the consolidated result to HEARTBEAT.md

**Dependency-aware alert suppression:** Hard dependencies block downstream alerts (e.g., if watcher is missing, meta won't alert about missing index). Soft dependencies add informational notes without blocking.

**Declined state:** When the user declines a component alert, the heading suffix changes to `## jeeves-{name}: declined` and content is removed. Declined components are not re-prompted.

**Proactive update alerts:** `checkRegistryVersion()` compares installed vs latest npm versions and renders update arrows (⬆) in HEARTBEAT alerts when newer versions are available.

## Dual-Layer Locking Architecture

Managed content writes use two locking layers to prevent conflicts:

**Workspace lock (outer):** `withWorkspaceLock()` acquires a workspace-level lock (`jeeves.lock`) with zero-retry semantics. If the lock is held by another plugin's cycle, the current cycle skips silently. This eliminates lock stampedes when multiple plugin timer cycles align.

**File lock (inner):** `withFileLock()` acquires per-file locks in `updateManagedSection`, `writeHeartbeatSection`, and `removeManagedSection`. This inner layer protects out-of-cycle callers (e.g., plugin uninstall) that bypass the workspace lock.

Both layers use a 2-minute stale threshold (`STALE_LOCK_MS`) to recover from crashed processes. The workspace lock wraps the entire cycle body, so within a cycle all file operations execute without contention.

## Workspace Configuration

An optional `jeeves.config.json` at the workspace root provides shared defaults for all CLI commands and programmatic consumers. Values are namespaced under `core.*` (workspace path, config root, gateway URL, dev repo mappings) and `memory.*` (budget, warning threshold).

Resolution precedence: **CLI flags → environment variables → `jeeves.config.json` → defaults**. The `jeeves config [jsonpath]` command prints the effective resolved values with per-key provenance tracking.

A JSON Schema file (`jeeves.config.schema.json`) is generated alongside `jeeves.config.json` during install, providing IDE autocomplete and validation.

## Memory Hygiene

MEMORY.md is the assistant's curated long-term memory, loaded at every session start. Core tracks its health:

- **Character budget** (default: 20,000) with usage percentage and a configurable warning threshold (default: 80%)

`jeeves status` prints a memory hygiene summary alongside the service health table. Memory hygiene is reporting-only — core never auto-deletes content (Decision 42). Size pressure is the right signal for curation.

## Skill Seeding

`jeeves install` (and component plugin installers) seed a platform skill at `{workspace}/skills/jeeves/SKILL.md`. This skill gives the assistant architectural context about the platform: component roles, data flow, service discovery patterns, managed content, HEARTBEAT protocol, and memory hygiene. The skill is regenerated on every install to stay current with the library version.

## Node.js Requirement

Jeeves requires Node.js >= 22. The CLI enforces this at startup via `checkNodeVersion()`, which exits with a clear error message if the runtime doesn't meet the minimum.

## Design Philosophy

**The content is the bootstrap.** The assistant doesn't know what plugins are installed or what services are running. He reads files. TOOLS.md tells him what tools exist. SOUL.md tells him who he is. AGENTS.md tells him how to operate. Everything else — plugins, services, npm packages — is infrastructure for maintaining those files.

**No core plugin.** Jeeves is a library, not a plugin. He registers zero tools with the OpenClaw gateway. Component plugins bundle the library and maintain managed content on timer cycles. The CLI seeds files and exits.

**Components are autonomous.** Each component can deploy and function without any other component being installed. Running `npx @karmaniverous/jeeves install` first provides a better experience (the assistant immediately knows what to bootstrap), but it's not required.

**Earned, not prescribed.** Hard gates in SOUL.md carry provenance: "Earned: triggered a full reindex just to pick up one file." Every behavioral rule exists because something went wrong. The platform encodes accumulated operational wisdom, not theoretical best practices.
