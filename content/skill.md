---
name: jeeves
description: Jeeves platform architecture, data flow, component interaction, scripts repo, and coordination knowledge. Use when making architectural decisions, coordinating across components, checking platform health, managing service lifecycle, or working with the scripts repo.
---

# Jeeves Platform Skill

## Platform Architecture

Jeeves is a four-component platform coordinated by a shared library (`@karmaniverous/jeeves`):

| Component | Role | Port |
|-----------|------|------|
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
- **Core** provides shared content management (TOOLS.md, SOUL.md, AGENTS.md), service discovery, config resolution, and the component SDK.

## Service Discovery

Services find each other via config resolution:
1. Component's own config file (`{configRoot}/jeeves-{name}/config.json`)
2. Core config file (`{configRoot}/jeeves-core/config.json`)
3. Default port constants

## Scripts Repo

Location: `{configRoot}/jeeves-core/scripts/`
Template: `@karmaniverous/jeeves-scripts-template`

Scripts use utilities from `@karmaniverous/jeeves` (general) and `@karmaniverous/jeeves-runner` (runner-specific). Any script that could be useful outside runner scheduling belongs in core.

## Managed Content System

Core maintains managed sections in workspace files using comment markers:
- **TOOLS.md** — Component sections (section mode) + Platform section
- **SOUL.md** — Professional discipline and behavioral foundations (block mode)
- **AGENTS.md** — Operational protocols and memory architecture (block mode)
- **HEARTBEAT.md** — Platform health status (heading-based)

Managed blocks are stationary after initial insertion. Cleanup detection uses Jaccard similarity on 3-word shingles. Cleanup escalation spawns a gateway session when orphaned content is detected.

## Workspace Configuration

`jeeves.config.json` at workspace root provides shared defaults:
- Precedence: CLI flags → env vars → file → defaults
- Namespaced: `core.*` (workspace, configRoot, gatewayUrl) and `memory.*` (budget, warningThreshold, staleDays)
- Inspect with `jeeves config [jsonpath]`

## HEARTBEAT Protocol

The HEARTBEAT system uses a state machine per component:
`not_installed → deps_missing → config_missing → service_not_installed → service_stopped → healthy`

Dependency-aware: hard deps block alerts, soft deps add informational notes. Declined components are tracked via heading suffix.

## Plugin Lifecycle

```bash
# Core install (seed workspace content)
npx @karmaniverous/jeeves install

# Component plugin install
npx @karmaniverous/jeeves-{component}-openclaw install

# Component plugin uninstall
npx @karmaniverous/jeeves-{component}-openclaw uninstall

# Core uninstall (remove managed sections)
npx @karmaniverous/jeeves uninstall
```

## Memory Hygiene

MEMORY.md has a character budget (default 20,000). Core tracks:
- Character count and usage percentage
- Warning at 80% of budget
- Stale section candidates (H2 sections whose most recent ISO date exceeds the staleness threshold)
- Evergreen sections (no dates) are never flagged

Review is human/agent-mediated — core does not auto-delete.

### HEARTBEAT Integration

Memory hygiene is checked on every `ComponentWriter` cycle alongside component health. When budget or staleness thresholds are breached, a `## MEMORY.md` alert appears in HEARTBEAT.md under `# Jeeves Platform Status`. The alert includes character count, budget usage percentage, and any stale section names. When memory is healthy, the heading is absent — no alert content, no LLM cost on heartbeat polls.

The `## MEMORY.md` heading follows the same declined/active lifecycle as component headings (`## jeeves-{name}`). Users can decline memory alerts by changing the heading to `## MEMORY.md: declined`.
