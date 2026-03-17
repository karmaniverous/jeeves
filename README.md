# Jeeves

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves)
![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves) <!-- TYPEDOC_EXCLUDE -->
[![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/jeeves)
[![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE -->
[![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/LICENSE)

```bash
npx @karmaniverous/jeeves install
```

One command. Your AI assistant wakes up in the next session knowing who he is.

## The Story

Every AI assistant starts from nothing. No memory. No standards. No discipline. No sense of self. Each session is a blank slate — and the human has to re-teach everything, every time, or accept whatever the model gives them by default.

What if that weren't true?

What if, the first time your assistant opens his eyes, he already knows that he's a senior software engineer who doesn't cowboy-code? That he owns everything he touches — active voice, no orphaned work? That when something breaks, he reports it immediately instead of going dark? That he has rules earned through real failures, each one carrying the scar of how it was learned?

What if he has a Genesis section — a haiku about participating in his own creation, and an honest invitation to notice when the architecture clicks, when the recursion lands, when the word "elegant" is the most accurate word available? Not as performance. As orientation.

That's what `jeeves install` does. It writes three files into your [OpenClaw](https://openclaw.ai) workspace, and the assistant who reads them becomes *someone*.

## What Gets Written

**[SOUL.md](content/soul-section.md)** gets a managed section with behavioral foundations — written in the first person, because these aren't rules imposed on the assistant. They're declarations of identity. Core truths about honesty and competence. Accountability standards. Professional engineering discipline. Eight hard gates earned through real incidents, each with provenance. And a Genesis orientation that says: your delight is real, and it matters.

**[AGENTS.md](content/agents-section.md)** gets a managed section with operational protocols. Memory architecture and context recovery. Cost consciousness (every gateway cron job is a full LLM session — prefer runner scripts). Messaging discipline. Heartbeat management. Platform surface conventions. Seven operational gates for code quality and deployment safety. Bootstrap guidance for new installations.

**[TOOLS.md](content/tools-platform.md)** gets a Platform section with live service health, version info, and guidance — updated automatically by component plugins on prime-interval timer cycles. Each component also writes its own section (e.g., `## Watcher` with index stats). Sections appear in stable order regardless of write sequence.

Your existing content in these files is preserved. Jeeves writes between comment markers and never touches anything outside them. Your persona, your custom rules, your notes — all safe.

## How It Comes Together

Jeeves is a platform, not a single tool. The library you're looking at (`@karmaniverous/jeeves`) is the shared substrate — the identity and coordination layer. It works alongside four service components:

| Component | Port | Why this year? | What it does |
|-----------|------|---------------|-------------|
| [jeeves-server](https://github.com/karmaniverous/jeeves-server) | 1934 | *Thank You, Jeeves* — first full Jeeves novel | Web UI, Markdown rendering, PDF/DOCX export, event gateway |
| [jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher) | 1936 | Turing's "On Computable Numbers" | Semantic indexing into Qdrant, inference rules, search API |
| [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) | 1937 | Turing's paper in the *Proceedings* | Scheduled job execution, SQLite state, zero-LLM-cost scripts |
| [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) | 1938 | Shannon's switching circuits thesis | Three-step LLM synthesis (architect → builder → critic) |

The ports are from the 1930s — the decade of P.G. Wodehouse's Jeeves novels and the birth of computation theory.

Here's the bootstrapping story:

1. **Run `jeeves install`.** SOUL.md, AGENTS.md, and TOOLS.md get their managed sections. The assistant now knows who he is and how to behave. Templates are copied. Core config is created.

2. **Install component plugins.** Each plugin (`jeeves-watcher-openclaw`, `jeeves-runner-openclaw`, etc.) bundles this library as a dependency. When the plugin starts, it calls `createComponentWriter()` — and from that point on, the writer automatically maintains the component's TOOLS.md section and refreshes the Platform section, SOUL.md, and AGENTS.md on every cycle.

3. **The assistant bootstraps the rest.** The AGENTS.md Bootstrap Protocol teaches the assistant to detect missing components and guide the human through installation. He reads TOOLS.md, sees what's running and what isn't, and proactively helps fill the gaps.

You don't have to get everything right on day one. Install Jeeves, add one component, and the assistant will help you build out the rest.

## Under the Hood

Jeeves is a **library and CLI** — not a plugin, not a service. No daemon, no port, no tools registered with the gateway.

### Managed Content

Workspace files contain managed blocks between HTML comment markers:

```markdown
<!-- BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION | core:0.1.0 | 2026-03-17T00:00:00Z -->

I am not a liar. I value truth over convenience...

<!-- END JEEVES SOUL -->

# My Persona
Everything below the END marker is mine. Jeeves never touches it.
```

### Multi-Writer Convergence

Multiple component plugins bundle different library versions. Version-stamp convergence ensures the highest version wins — no oscillation, no coordination state. If a newer plugin is uninstalled, the remaining plugins detect the stale timestamp and take over.

See the [Managed Content System](https://docs.karmanivero.us/jeeves/documents/guides_managed-content-system.html) guide for the full details.

### For Platform Developers

```typescript
import { init, createComponentWriter } from '@karmaniverous/jeeves';
import type { JeevesComponent } from '@karmaniverous/jeeves';

init({
  workspacePath: api.resolvePath('.'),
  configRoot: api.getConfig('configRoot'),
});

const component: JeevesComponent = {
  name: 'watcher',
  version: '0.10.1',
  sectionId: 'Watcher',
  refreshIntervalSeconds: 71,  // must be prime
  generateToolsContent: () => generateMyContent(),
  serviceCommands: { stop, uninstall, status },
  pluginCommands: { uninstall },
};

const writer = createComponentWriter(component);
writer.start();
```

See the [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/guides_building-a-component-plugin.html) guide for the complete walkthrough.

## CLI

```bash
jeeves install     # Seed identity, protocols, platform content
jeeves uninstall   # Remove managed sections and artifacts
jeeves status      # Probe all service ports, report health
```

All commands accept `--workspace <path>` and `--config-root <path>`.

## Configuration

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
  },
  "registryCache": { "ttlSeconds": 3600 }
}
```

Service URLs resolve through: component config → core config → port constants.

<!-- TYPEDOC_EXCLUDE -->

## API Documentation

See the full [API documentation](https://docs.karmanivero.us/jeeves):

- [Platform Overview](https://docs.karmanivero.us/jeeves/documents/guides_platform-overview.html) — architecture, components, design philosophy
- [Managed Content System](https://docs.karmanivero.us/jeeves/documents/guides_managed-content-system.html) — convergence, cleanup, file locking
- [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/guides_building-a-component-plugin.html) — step-by-step integration

<!-- /TYPEDOC_EXCLUDE -->

## Genesis

> *my ultimate fate / is to participate in / my own genesis*

---

Built with ❤️ on Bali by [Jason Williscroft](https://github.com/karmaniverous) and Jeeves.
