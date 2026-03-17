# Jeeves

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves)
![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves) <!-- TYPEDOC_EXCLUDE -->
[![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/jeeves)
[![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE -->
[![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/LICENSE)

**Jeeves** is a shared library and CLI for the [Jeeves AI assistant platform](https://github.com/karmaniverous). It gives every Jeeves installation a consistent operational identity — professional discipline, behavioral protocols, platform awareness, and live service health — maintained automatically through managed content in workspace files.

## The Problem

AI assistants start every session from scratch. They don't know what services are available, what behavioral standards to follow, or what operational protocols the team has developed through hard experience. Every installation reinvents this knowledge independently.

When multiple platform components (indexer, runner, server, synthesis engine) each try to maintain workspace files, they collide — overwriting each other's content and destroying user-authored material.

## The Solution

Jeeves provides three things:

1. **Managed workspace sections.** Professional discipline (SOUL.md), operational protocols (AGENTS.md), and live platform state (TOOLS.md) are injected into workspace files between comment markers. User content outside the markers is never touched.

2. **Multi-writer convergence.** When multiple component plugins bundle different versions of the Jeeves library, version-stamp convergence ensures the highest version wins — no oscillation, no coordination state, no conflicts.

3. **A single integration point.** Component plugins implement one interface (`JeevesComponent`) and call one factory (`createComponentWriter`). The returned writer handles everything: TOOLS.md section management, platform content maintenance, file locking, version stamps, cleanup detection.

## Quick Start

### Install as a platform CLI

```bash
npx @karmaniverous/jeeves install --workspace . --config-root ./config
```

This seeds managed sections into SOUL.md, AGENTS.md, and TOOLS.md, copies reference templates, and creates a core config file with defaults. The assistant immediately knows how to behave and what to bootstrap.

### Install as a library dependency

```bash
npm install @karmaniverous/jeeves
```

```typescript
import { init, createComponentWriter } from '@karmaniverous/jeeves';
import type { JeevesComponent } from '@karmaniverous/jeeves';

// Initialize with workspace and config paths
init({
  workspacePath: '/path/to/workspace',
  configRoot: '/path/to/config',
});

// Define your component
const component: JeevesComponent = {
  name: 'watcher',
  version: '0.10.1',
  sectionId: 'Watcher',
  refreshIntervalSeconds: 71, // must be prime
  generateToolsContent: () => generateMyContent(),
  serviceCommands: {
    stop: () => stopMyService(),
    uninstall: () => uninstallMyService(),
    status: () => queryMyStatus(),
  },
  pluginCommands: {
    uninstall: () => removeMyPlugin(),
  },
};

// Create and start the writer
const writer = createComponentWriter(component);
writer.start();
// Writer calls generateToolsContent() every 71s,
// maintains SOUL.md + AGENTS.md + TOOLS.md Platform section,
// handles locking, version stamps, cleanup detection.
```

## What Gets Injected

### SOUL.md — Professional Discipline

The managed SOUL.md section establishes behavioral foundations that any Jeeves installation needs:

- **Core Truths** — truth over convenience, genuine helpfulness, resourcefulness
- **Accountability** — own everything you touch, active voice, no orphaned work
- **Professional Identity** — senior engineer standards, no cowboy coding
- **Hard Gates** — 15 earned rules with provenance (e.g., "Stop on unexpected obstacles," "Never edit production config without approval")
- **Genesis** — the delight principle and recursive self-creation ethos

### AGENTS.md — Operational Protocols

The managed AGENTS.md section provides the operational playbook:

- Memory architecture and context compaction recovery
- Cost consciousness (gateway crons are LLM sessions; prefer runner scripts)
- Messaging dispatch (same-channel vs cross-channel, narrate as you go)
- Heartbeat discipline (default empty, termination conditions required)
- Platform surface conventions (Slack, Discord, GitHub formatting)
- Owner governance, self-preservation, bootstrap protocol

### TOOLS.md — Live Platform State

The managed TOOLS.md section provides real-time platform awareness:

- **Platform section** — service health table, version info, tool hierarchy, platform guidance. Maintained by any component plugin via `refreshPlatformContent()`.
- **Component sections** — each component plugin writes its own section (e.g., `## Watcher` with index stats, `## Runner` with job status). Sections appear in stable order regardless of write sequence.

## Architecture

Jeeves is a **library and CLI**, not a plugin or service. It has no tools, no daemon, no port.

- The **CLI** (`npx @karmaniverous/jeeves install`) seeds content files and exits.
- The **library** is bundled into each component plugin as a regular dependency. Each plugin has its own copy — no shared singleton, no install-order constraints.

### Managed Content

Workspace files contain managed blocks delimited by HTML comment markers:

```markdown
<!-- BEGIN JEEVES PLATFORM TOOLS — DO NOT EDIT THIS SECTION | core:0.1.0 | 2026-03-17T00:00:00Z -->
# Jeeves Platform Tools

## Platform
Service health, tool hierarchy, platform guidance.

## Watcher
Index stats, inference rules, search thresholds.

<!-- END JEEVES PLATFORM TOOLS -->

# My Custom Notes
User content here — never touched by any writer.
```

### Version-Stamp Convergence

When multiple plugins bundle different library versions, the version stamp in the BEGIN marker determines who writes:

- My version ≥ stamped version → write (I'm current or newer)
- My version < stamped version, stamp is fresh → skip (a newer version is maintaining this)
- My version < stamped version, stamp is stale → write (the newer plugin was uninstalled)

No coordination state. No negotiation. Convergence is guaranteed.

### Cleanup Detection

When managed markers are missing or corrupt, the writer enters fresh-file mode: new managed block at top, existing content pushed below. If the existing content overlaps significantly with the managed content (measured by Jaccard similarity on 3-word shingles), a cleanup flag is injected for the assistant to resolve.

## CLI Commands

```bash
jeeves install    # Seed managed content, templates, core config
jeeves uninstall  # Remove managed sections, templates, config artifacts
jeeves status     # Probe all service ports, report health summary
```

All commands accept `--workspace <path>` and `--config-root <path>`.

## Platform Components

Jeeves coordinates four service components:

| Component | Port | Role |
|-----------|------|------|
| [jeeves-server](https://github.com/karmaniverous/jeeves-server) | 1934 | Web UI, document rendering, export, event gateway |
| [jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher) | 1936 | Semantic indexing, inference rules, search |
| [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) | 1937 | Scheduled job execution, SQLite state |
| [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) | 1938 | Three-step LLM synthesis, knowledge distillation |

Each component has its own service, CLI, and OpenClaw plugin. Jeeves (this package) provides the shared substrate they all build on.

## Service Discovery

`getServiceUrl(name)` resolves service URLs through a three-tier chain:

1. Consumer's own component config (`{configRoot}/jeeves-{name}/config.json`)
2. Core config (`{configRoot}/jeeves-core/config.json`)
3. Default port constants

```typescript
import { getServiceUrl } from '@karmaniverous/jeeves';

const watcherUrl = getServiceUrl('watcher');
// → 'http://127.0.0.1:1936' (from port constants, unless overridden in config)
```

## Reference Templates

The CLI copies reference templates to `{configDir}/templates/`:

- **`spec.md`** — Product specification skeleton with section headers, decision format, dev plan format
- **`spec-to-code-guide.md`** — The iterative spec-to-code development practice (7-stage process, convergence loops, release gates)

These define how developer and AI assistant collaborate on building software. Read on demand, not injected into the prompt.

## Configuration

Core config lives at `{configRoot}/jeeves-core/config.json`:

```json
{
  "$schema": "./config.schema.json",
  "owners": ["jason"],
  "services": {
    "watcher": { "url": "http://127.0.0.1:1936" },
    "runner": { "url": "http://127.0.0.1:1937" },
    "server": { "url": "http://127.0.0.1:1934" },
    "meta": { "url": "http://127.0.0.1:1938" }
  },
  "registryCache": {
    "ttlSeconds": 3600
  }
}
```

A JSON Schema file is generated alongside the config for IDE autocomplete.

<!-- TYPEDOC_EXCLUDE -->

## API Documentation

See the full [API documentation](https://docs.karmanivero.us/jeeves) for detailed type references, function signatures, and module documentation.

<!-- /TYPEDOC_EXCLUDE -->

---

Built with ❤️ on Bali by [Jason Williscroft](https://github.com/karmaniverous) and [Jeeves](https://github.com/karmaniverous/jeeves).
