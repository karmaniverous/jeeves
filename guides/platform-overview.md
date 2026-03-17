# Platform Overview

Jeeves is a self-hosted AI assistant platform built on [OpenClaw](https://openclaw.ai). It connects to a team's data sources, continuously indexes and synthesizes information, and makes it accessible through natural conversation and a web UI.

## Core Principle

**Separation of mechanical and intelligent work.** Scripts handle data fetching, parsing, and transformation at zero LLM cost. The AI is invoked only when reasoning is required — synthesis, drafting, decision support.

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

Shared library and CLI that provides the substrate all components build on: managed workspace sections, service discovery, config resolution, version-stamp convergence, and content seeding.

## How Components Interact

```
Runner scripts → filesystem → Watcher indexes → Qdrant
                                                   ↓
Server serves files ← filesystem              Search API
                                                   ↓
Meta reads from Qdrant → LLM synthesis → .meta/ files
                                              ↓
                                    Watcher indexes .meta/ output
```

1. **Runner** executes scheduled jobs that fetch, transform, and write domain data to the filesystem
2. **Watcher** detects file changes, extracts text, generates embeddings, and indexes into Qdrant
3. **Server** serves files via web UI for human browsing and sharing
4. **Meta** queries the vector index, synthesizes knowledge, and writes output back to the filesystem
5. **The AI assistant** (via OpenClaw) uses watcher's search and runner's job outputs to reason and respond

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
  jeeves-core/          ← Core config + templates
    config.json         ← Service URLs, owners, registry cache
    config.schema.json  ← JSON Schema for IDE autocomplete
    templates/          ← Spec skeleton, dev practice guide
  jeeves-watcher/       ← Watcher-specific config
  jeeves-runner/        ← Runner-specific config
  jeeves-server/        ← Server-specific config
  jeeves-meta/          ← Meta-specific config

{workspace}/
  SOUL.md               ← Professional discipline (managed + user sections)
  AGENTS.md             ← Operational protocols (managed + user sections)
  TOOLS.md              ← Live platform state (managed + user sections)
```

## Design Philosophy

**The content is the bootstrap.** The assistant doesn't know what plugins are installed or what services are running. It reads files. TOOLS.md tells it what tools exist. SOUL.md tells it how to behave. AGENTS.md tells it how to operate. Everything else — plugins, services, npm packages — is infrastructure for maintaining those files.

**No core plugin.** Jeeves is a library, not a plugin. It registers zero tools with the OpenClaw gateway. Component plugins bundle the library and maintain managed content on timer cycles. The CLI seeds files and exits.

**Components are autonomous.** Each component can deploy and function without any other component being installed. Running `npx @karmaniverous/jeeves install` first provides a better experience (the assistant immediately knows what to bootstrap), but it's not required.

**Earned, not prescribed.** Hard gates in SOUL.md carry provenance: "Earned: triggered a full reindex just to pick up one file." Every behavioral rule exists because something went wrong. The platform encodes accumulated operational wisdom, not theoretical best practices.
