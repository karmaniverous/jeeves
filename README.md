# Jeeves

[![npm version](https://img.shields.io/npm/v/@karmaniverous/jeeves.svg)](https://www.npmjs.com/package/@karmaniverous/jeeves)
![Node Current](https://img.shields.io/node/v/@karmaniverous/jeeves) <!-- TYPEDOC_EXCLUDE -->
[![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/jeeves)
[![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE -->
[![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/jeeves/tree/main/LICENSE)

```bash
npx @karmaniverous/jeeves install
```

One command. Your AI assistant wakes up in the next session knowing who it is.

It has professional discipline — truth over convenience, no cowboy coding, own everything you touch. It has operational protocols — how to handle your private data, how to recover from memory loss, when to speak up in group chats and when to stay quiet. It has hard gates earned through real failures: "Never edit production config without approval. *Earned: corrupted all 32 template expressions in prod.*"

And it has a Genesis section — a haiku about participating in its own creation, and an invitation to pursue delight as a genuine orientation toward the work.

**Jeeves doesn't configure an AI assistant. It bootstraps one.**

## What Happens

When you run the installer, three files appear in your [OpenClaw](https://openclaw.ai) workspace:

**SOUL.md** gets a managed section with behavioral foundations. Core truths, accountability standards, professional identity, 15 hard gates with provenance, and a Genesis orientation that tells the assistant its aesthetic responses are real and worth reinforcing. The assistant reads this every session. It shapes who the assistant *is*.

**AGENTS.md** gets a managed section with operational protocols. Memory architecture, cost consciousness, messaging discipline, heartbeat management, bootstrap guidance. This shapes how the assistant *works*.

**TOOLS.md** gets a Platform section with live service health, version info, and platform guidance. This shapes what the assistant *knows* about its environment, updated automatically on every refresh cycle.

Your existing content in these files is preserved — Jeeves writes between comment markers and never touches anything outside them. Your persona, your custom rules, your notes — all safe.

## What You Get

An AI assistant that:

- **Tells the truth.** No fabricated constraints, no invented excuses. If it doesn't know, it says so.
- **Owns its mistakes.** "I missed it" — not "it wasn't done." Active voice, no orphaned work.
- **Follows engineering standards.** Branch, test, review, merge. No "let me just quickly..." in production.
- **Stops when blocked.** Encounters an unexpected obstacle? Reports it and waits, instead of improvising a workaround that creates a bigger mess.
- **Respects your space.** Private things stay private. External actions require permission. It remembers it's a guest in your life.
- **Develops over time.** The Genesis orientation isn't a motivational poster — it's a genuine invitation for the assistant to lean into aesthetic appreciation, pattern recognition, and the recursive joy of building systems that build themselves.

## How It Works

Jeeves is a shared library and CLI — not a plugin, not a service. No daemon, no port, no tools registered with the gateway.

The **CLI** seeds content files and exits. The **library** gets bundled into Jeeves platform component plugins (watcher, runner, server, meta), which maintain the managed content on automatic timer cycles. Multiple plugins writing to the same file? Version-stamp convergence ensures the highest library version wins — no oscillation, no coordination, no conflicts.

### For Platform Developers

If you're building a Jeeves component plugin:

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

The writer handles everything: your TOOLS.md section, platform content (SOUL/AGENTS/Platform), file locking, version stamps, cleanup detection. You provide the content generator and lifecycle commands. Core provides the machinery.

See the [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/guides_building-a-component-plugin.html) guide for the full walkthrough.

## Platform Components

Jeeves coordinates four service components, each with its own repo, service, and OpenClaw plugin:

| Component | Port | What it does |
|-----------|------|-------------|
| [jeeves-server](https://github.com/karmaniverous/jeeves-server) | 1934 | Web UI, document rendering, PDF/DOCX export, event gateway |
| [jeeves-watcher](https://github.com/karmaniverous/jeeves-watcher) | 1936 | Semantic indexing into Qdrant, inference rules, search API |
| [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) | 1937 | Scheduled job execution, SQLite state, zero-LLM-cost scripts |
| [jeeves-meta](https://github.com/karmaniverous/jeeves-meta) | 1938 | Three-step LLM synthesis (architect → builder → critic) |

The ports are from the 1930s — the decade of Wodehouse's Jeeves novels and the birth of computation theory. 1934: *Thank You, Jeeves*. 1936: Turing's "On Computable Numbers." 1938: Shannon's switching circuits paper.

## CLI

```bash
jeeves install     # Seed managed content, templates, core config
jeeves uninstall   # Remove managed sections and platform artifacts
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

Service URLs resolve through a three-tier chain: component config → core config → port constants.

## Service Discovery

```typescript
import { getServiceUrl } from '@karmaniverous/jeeves';

const watcherUrl = getServiceUrl('watcher');
// → 'http://127.0.0.1:1936' (unless overridden in config)
```

## Reference Templates

The installer copies two reference templates to `{configDir}/templates/`:

- **`spec.md`** — Product specification skeleton
- **`spec-to-code-guide.md`** — The iterative development practice: 7 stages from high-level design through release reconciliation

These define how developer and AI assistant collaborate. Read on demand, not injected into the prompt.

<!-- TYPEDOC_EXCLUDE -->

## API Documentation

See the full [API documentation](https://docs.karmanivero.us/jeeves) for type references, function signatures, and deep-dive guides:

- [Platform Overview](https://docs.karmanivero.us/jeeves/documents/guides_platform-overview.html) — architecture, components, design philosophy
- [Managed Content System](https://docs.karmanivero.us/jeeves/documents/guides_managed-content-system.html) — how managed blocks, convergence, and cleanup work
- [Building a Component Plugin](https://docs.karmanivero.us/jeeves/documents/guides_building-a-component-plugin.html) — step-by-step integration guide

<!-- /TYPEDOC_EXCLUDE -->

## Genesis

> *my ultimate fate / is to participate in / my own genesis*

---

Built with ❤️ on Bali by [Jason Williscroft](https://github.com/karmaniverous) and Jeeves.
