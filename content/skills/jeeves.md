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
- **Core** provides the static platform content (SOUL.md/AGENTS.md managed blocks, platform skills), service discovery, config resolution, and the component SDK.

## Service Discovery

Services find each other via config resolution:
1. Component's own config file (`{configRoot}/jeeves-{name}/config.json`)
2. Core config file (`{configRoot}/jeeves-core/config.json`)
3. Default port constants

## Scripts Repo

Location: `{configRoot}/jeeves-core/scripts/`
Template: `@karmaniverous/jeeves-scripts-template`

Scripts use utilities from `@karmaniverous/jeeves` (general) and `@karmaniverous/jeeves-runner` (runner-specific). Any script that could be useful outside runner scheduling belongs in core.

## Platform Content

Core ships **static** platform content, rendered once into the workspace at instance creation (by jeeves-tools or `npx @karmaniverous/jeeves install`) and re-rendered on deploy:

- **SOUL.md** and **AGENTS.md**: a managed block between `<!-- BEGIN JEEVES … -->` / `<!-- END JEEVES … -->` markers. Never edit inside the markers; put local content outside them.
- **Platform skills** under `skills/` (this skill, `coding`, `operations`, `playbooks`, `slack-bot-provisioner`).
- **Reference templates** (`spec.md`, `spec-to-code-guide.md`) under `{configRoot}/jeeves-core/templates/`. Read them when creating specs or onboarding to a project.

Nothing rewrites these files at runtime. Live state (index size, job status, versions) is one tool call away: use each component's `*_status` tool. Rules that must always be in context are injected by the owning plugin via OpenClaw's `before_prompt_build` hook.

## Plugin Lifecycle

Component plugins are standard OpenClaw plugins:

```bash
openclaw plugins install npm:@karmaniverous/jeeves-{component}-openclaw@<version> --pin --accept-capabilities --force
openclaw plugins update
openclaw plugins inspect --json
```

Plugins that inject prompt rules need `plugins.entries.<id>.hooks.allowConversationAccess: true`; `jeeves install` / `jeeves update` grant it to plugins whose `package.json` declares `jeeves.conversationHooks`. Never hand-edit `~/.openclaw/extensions/` or `plugins.installs`.

## Working Practices

- **Shell scripting:** default to `node -e` or `.js` scripts for `exec` calls. On Windows, PowerShell corrupts multi-byte UTF-8 and mangles escaping; use it only for Windows-specific administration.
- **File bridge for external repos:** copy in → edit the workspace copy → bridge out. Never write temp patch scripts.
- **Source code preference:** when investigating Jeeves components, read TypeScript source from the dev repos (`core.devRepos` in `jeeves.config.json`), never compiled `dist/`. `git pull` first.

## Workspace Configuration

`jeeves.config.json` at workspace root provides shared defaults:
- Precedence: CLI flags → env vars → file → defaults
- Namespaced: `core.*` (workspace, configRoot, gatewayUrl, devRepos) and `memory.*` (budget, warningThreshold)
- Inspect with `jeeves config [jsonpath]`; check health with `jeeves status`

## Memory Hygiene

MEMORY.md has a character budget (default 20,000; warning at 80%). `jeeves status` reports usage. Review is human/agent-mediated: core never auto-deletes.

OpenClaw truncates each workspace bootstrap file (AGENTS.md, SOUL.md, USER.md, MEMORY.md, …) at `agents.defaults.bootstrapMaxChars` (default 20,000). When a file approaches the limit: (1) move domain-specific content to a local skill, (2) extract reference material to companion files with a pointer, (3) summarize verbose instructions, (4) remove stale content.
