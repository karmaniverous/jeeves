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

## Content as Data

| Export               | What it is                                         |
| -------------------- | -------------------------------------------------- |
| `PLATFORM_SECTIONS`  | `{ soul, agents }`, each `{ file, markers, body }` |
| `PLATFORM_SKILLS`    | Skill directory name → complete `SKILL.md`         |
| `PLATFORM_TEMPLATES` | Template file name → content                       |

Markdown sources live in `content/` and are inlined at build time, so the data is available wherever core is bundled.

## Rendering

All render functions are pure (no I/O). Callers write the results.

```typescript
import {
  renderPlatformContent,
  upsertPlatformSection,
} from '@karmaniverous/jeeves';

// Fresh instance: everything, with relative paths.
const out = renderPlatformContent({ version: '1.0.0' });
// out.sections.soul.block, out.sections.agents.block
// out.skills     → [{ path: 'skills/jeeves/SKILL.md', content }, ...]  (workspace-relative)
// out.templates  → [{ path: 'templates/spec.md', content }, ...]      ({configRoot}/jeeves-core-relative)

// Existing file: insert or replace the block, preserving user content.
const agents = upsertPlatformSection('agents', existingAgentsMd, {
  version: '1.0.0',
});
```

- Replacing an existing block keeps content before and after it where it was.
- Inserting a new block uses the marker set's `position`; an orphaned BEGIN marker (BEGIN without END) is stripped first.
- For a fixed `{ version, now }` the output is deterministic, and re-applying it is a no-op.

Lower-level transforms for any marker set: `renderManagedBlock`, `upsertManagedBlock`, `removeManagedBlock`, `parseManaged`, `formatBeginMarker`, `formatEndMarker`.

`jeeves install` is a thin filesystem adapter over these functions; `jeeves uninstall` removes the blocks (and any legacy TOOLS.md block).

## Budgets

OpenClaw truncates each bootstrap file at `agents.defaults.bootstrapMaxChars` (default 20,000 chars, `BOOTSTRAP_FILE_MAX_CHARS`). The limit covers the whole file, so every char Jeeves uses is a char the owner can't.

| Budget                            | Chars  |
| --------------------------------- | ------ |
| `PLATFORM_SECTION_BUDGETS.soul`   | 7,500  |
| `PLATFORM_SECTION_BUDGETS.agents` | 7,500  |
| `PLATFORM_CONTENT_TOTAL_BUDGET`   | 15,000 |

Each budget measures the full rendered block (markers, stamp, and title included) and is at most half the per-file limit. `src/content/platformContent.test.ts` fails the build if content outgrows them. To add content, trim elsewhere or move it to a skill.

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
