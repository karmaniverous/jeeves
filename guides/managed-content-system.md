---
title: Managed Content System
---

# Managed Content System

Jeeves contributes a small amount of **static** content to each OpenClaw workspace: a managed block in SOUL.md, a managed block in AGENTS.md, a handful of platform skills, and two reference templates. This guide covers what that content is, how it is rendered, and how it coexists with the owner's own content.

Since v1 nothing rewrites workspace files at runtime. There is no timer, no TOOLS.md, no HEARTBEAT.md, and no cross-writer convergence. See [Migrating to v1](migrating-to-v1.md).

## The Managed Block

A managed block is delimited by HTML comment markers:

```markdown
# Your Own AGENTS Content

Anything outside the markers is yours and is never touched.

<!-- BEGIN JEEVES AGENTS — DO NOT EDIT THIS SECTION | core:1.0.0 | 2026-09-25T08:39:31.418Z -->

# Jeeves Platform Agents

...platform content...

<!-- END JEEVES AGENTS -->
```

The BEGIN marker carries a version stamp (core version and render time). Marker text is unchanged from v0.x, so re-rendering an instance that was managed by v0.x replaces the old block in place, including any v0.x cleanup flag inside it.

```typescript
interface ManagedMarkers {
  begin: string;
  end: string;
  title?: string; // H1 inside the block
  position?: 'top' | 'bottom'; // where a NEW block is inserted (default 'top')
}
```

Marker sets: `SOUL_MARKERS`, `AGENTS_MARKERS` (both `position: 'bottom'`), and `LEGACY_TOOLS_MARKERS` (only for stripping v0.x TOOLS.md blocks).

## Content Lives in the CLI

The content bodies, the skills and the templates are private to the `jeeves` CLI. Markdown sources live in `content/` and are inlined into the CLI bundle at build time. The library does not export them, and nothing but `jeeves install` renders them. That keeps one writer for platform content (spec v1 §2.2, decision log #5).

`jeeves install` renders:

| Output | Destination |
| --- | --- |
| SOUL managed block | `{workspace}/SOUL.md` (inserted or replaced in place) |
| AGENTS managed block | `{workspace}/AGENTS.md` (inserted or replaced in place) |
| Platform skills | `{workspace}/skills/<name>/SKILL.md` |
| Reference templates | `{configRoot}/jeeves-core/templates/` |
| Core config (only if missing) | `{configRoot}/jeeves-core/config.json` |

- Replacing an existing block keeps content before and after it where it was.
- Inserting a new block uses the marker set's `position`; an orphaned BEGIN marker (BEGIN without END) is stripped first.
- For a fixed version the output is deterministic apart from the render time in the stamp.
- `jeeves install --dry-run` lists every file it would write and writes nothing.
- `jeeves uninstall` removes the blocks, plus any legacy TOOLS.md block. Nothing writes TOOLS.md any more.

The generic, pure transforms stay in the library for any marker set: `renderManagedBlock`, `upsertManagedBlock`, `removeManagedBlock`, `parseManaged`, `formatBeginMarker`, `formatEndMarker`.

## Budgets

OpenClaw truncates each bootstrap file at `agents.defaults.bootstrapMaxChars` (default 20,000 chars). The limit covers the whole file, so every char Jeeves uses is a char the owner can't.

| Budget (internal to the CLI) | Chars  |
| ---------------------------- | ------ |
| SOUL block                   | 7,500  |
| AGENTS block                 | 7,500  |
| Both blocks together         | 15,000 |

Each budget measures the full rendered block (markers, stamp, and title included) and is at most half the per-file limit. `src/cli/jeeves/content/platformContent.test.ts` fails the build if content outgrows them. To add content, trim elsewhere or move it to a skill.

## Where Other Content Goes

| Content | Home |
| --- | --- |
| Platform identity and protocols | SOUL/AGENTS managed blocks (this package) |
| Platform how-to and reference | Platform skills (this package) |
| Component rules that must always be in context | The component plugin's `before_prompt_build` hook (`registerPromptContext`) |
| Component how-to | The component plugin's own skill (manifest `skills`) |
| Live state (counts, health, versions) | The component's `*_status` tool |

## File Helpers

- **`atomicWrite(filePath, content)`**: temp file + rename, retrying EPERM on Windows.
- **`withFileLock(filePath, fn, staleMs?)`**: cross-process advisory lock by atomic `mkdir` of `{file}.lock` (the same convention proper-lockfile used, so mixed-version holders exclude each other). Fails fast with `code: 'ELOCKED'`; takes over locks older than `STALE_LOCK_MS` (2 minutes). Registers no signal handlers and starts no timers.
