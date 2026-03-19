---
title: Managed Content System
---

# Managed Content System

The managed content system is the core mechanism Jeeves uses to maintain workspace files without destroying user-authored content. This guide covers how it works, how to extend it, and how to troubleshoot issues.

## How It Works

### The Managed Block

Every Jeeves-managed file contains a block delimited by HTML comment markers:

```markdown
<!-- BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION | core:0.1.0 | 2026-03-17T00:00:00Z -->

Professional discipline, hard gates, genesis orientation...

<!-- END JEEVES SOUL -->

# Your Custom Content

Everything below the END marker is yours. Jeeves never touches it.
```

The markers serve three purposes:
1. **Boundary:** clearly separate managed from user content
2. **Version stamp:** track which library version last wrote this block
3. **Human signal:** "DO NOT EDIT" warns against manual changes inside the block

### ManagedMarkers Type

Markers are defined by the `ManagedMarkers` interface:

```typescript
interface ManagedMarkers {
  begin: string;  // BEGIN comment marker text
  end: string;    // END comment marker text
  title?: string; // Optional H1 title prepended inside managed block
}
```

Three pre-defined marker sets are provided:

| Constant | Begin Text | Title |
|----------|-----------|-------|
| `TOOLS_MARKERS` | `BEGIN JEEVES PLATFORM TOOLS — DO NOT EDIT THIS SECTION` | Jeeves Platform Tools |
| `SOUL_MARKERS` | `BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION` | Jeeves Platform Soul |
| `AGENTS_MARKERS` | `BEGIN JEEVES AGENTS — DO NOT EDIT THIS SECTION` | Jeeves Platform Agents |

When `title` is set, an H1 heading is prepended inside the managed block automatically.

### Two Modes

The `updateManagedSection()` function supports two modes:

**Block mode** replaces the entire managed block. Used for SOUL.md and AGENTS.md, where core owns all the managed content.

```typescript
await updateManagedSection(filePath, content, {
  mode: 'block',
  markers: SOUL_MARKERS,
  coreVersion: '0.1.0',
});
```

**Section mode** upserts a named H2 section within the managed block. Used for TOOLS.md, where multiple components each contribute independent sections.

```typescript
await updateManagedSection(filePath, sectionContent, {
  mode: 'section',
  sectionId: 'Watcher',
  markers: TOOLS_MARKERS,
  coreVersion: '0.1.0',
});
```

In section mode, sections are always rendered in stable order (Platform, Watcher, Server, Runner, Meta) regardless of write sequence — controlled by `SECTION_ORDER`. Unknown section IDs are appended after the known ones.

### updateManagedSection

Full options interface:

```typescript
interface UpdateManagedSectionOptions {
  mode?: 'block' | 'section';       // Default: 'block'
  sectionId?: string;                // Required when mode is 'section'
  markers?: ManagedMarkers;          // Default: TOOLS_MARKERS
  coreVersion?: string;              // For version-stamp convergence
  stalenessThresholdMs?: number;     // Override staleness threshold
}
```

The function:
1. Creates the file and parent directories if they don't exist
2. Acquires a file lock via `withFileLock`
3. Parses existing content with `parseManaged`
4. In block mode, checks version-stamp convergence before writing
5. In section mode, upserts the named section (no version-stamp gating)
6. Runs cleanup detection against user content
7. Writes atomically via `atomicWrite`

### removeManagedSection

Removes a section or the entire managed block:

```typescript
interface RemoveManagedSectionOptions {
  sectionId?: string;       // If omitted, removes the entire managed block
  markers?: ManagedMarkers; // Default: TOOLS_MARKERS
}
```

- **No `sectionId`:** removes the entire managed block (markers + content), leaving user content intact.
- **With `sectionId`:** removes just that H2 section. If it was the last section, the entire managed block is removed.
- Missing markers or nonexistent sections are no-ops (no error thrown).

### Fresh File Handling

When markers don't exist (first write, or markers manually deleted):

1. The writer creates a new managed block at the top of the file
2. All existing file content is pushed below the END marker as user content
3. On subsequent cycles, the managed block is updated normally

This means `jeeves install` on an existing workspace adopts the user's content rather than overwriting it.

## Version-Stamp Convergence

When multiple component plugins bundle different versions of `@karmaniverous/jeeves`, they independently maintain the same shared content (SOUL.md, AGENTS.md, Platform section). The version stamp prevents oscillation:

| Scenario | Action |
|----------|--------|
| No existing stamp | Write (first write) |
| My version ≥ stamped version | Write (I'm current or newer) |
| My version < stamped, stamp is fresh | Skip (a newer version is maintaining this) |
| My version < stamped, stamp is stale | Write (the newer plugin was probably uninstalled) |

**Staleness threshold:** 5 minutes (`STALENESS_THRESHOLD_MS`), configurable per call. Well above any prime-interval cycle.

**Important:** Version-stamp convergence only applies in block mode (SOUL.md, AGENTS.md). In section mode (TOOLS.md), each component always writes its own section; the stamp doesn't gate individual section writes.

The version stamp is encoded in the BEGIN marker comment:

```
<!-- BEGIN JEEVES SOUL — DO NOT EDIT THIS SECTION | core:0.1.5 | 2026-03-19T11:02:49.308Z -->
```

Parsed by `VERSION_STAMP_PATTERN` into a `VersionStamp` with `version` and `timestamp` fields.

## Cleanup Detection

When the writer enters fresh-file mode (markers missing), existing content gets pushed to the user zone. If that content was actually managed content from a previous installation, it creates duplication: the same material exists both inside and below the managed block.

Jeeves detects this using **Jaccard similarity on 3-word shingles**:

1. `shingles(text, n=3)` generates the set of all n-word sequences from the text (lowercased, whitespace-split)
2. `jaccard(a, b)` computes Jaccard similarity: `|intersection| / |union|`
3. `needsCleanup(managedContent, userContent, threshold=0.15)` returns `true` if similarity exceeds the threshold

When cleanup is detected, a flag is injected inside the managed block:

```markdown
> ⚠️ CLEANUP NEEDED: Orphaned Jeeves content may exist below this managed section.
> Review everything after the END marker and remove any content that duplicates
> what appears above.
```

The flag is self-clearing: once the duplicate content is removed (by the assistant or manually), the similarity score drops below the threshold and the flag disappears on the next write cycle.

## File Locking and Atomic Writes

### withFileLock

All managed content writes use file-level locking via `proper-lockfile`:

```typescript
async function withFileLock(filePath: string, fn: () => void | Promise<void>): Promise<void>
```

- **Stale threshold:** 2 minutes (`STALE_LOCK_MS`). If a process crashes while holding the lock, the next writer recovers after 2 minutes.
- **Retries:** up to 5 times, with 100ms–1000ms backoff.
- Lock release is guaranteed via a `finally` block.

### atomicWrite

Writes are atomic: content is written to a temporary file (timestamped `.tmp`), then renamed over the target via `renameSync`. This prevents partial writes from corrupting the file if the process is interrupted.

```typescript
function atomicWrite(filePath: string, content: string): void
```

## Extending with Custom Markers

You can use the managed content system for your own files by providing custom markers:

```typescript
const MY_MARKERS: ManagedMarkers = {
  begin: 'BEGIN MY CUSTOM SECTION',
  end: 'END MY CUSTOM SECTION',
  title: 'My Custom Title',  // optional; adds H1 in section mode
};

await updateManagedSection(myFilePath, content, {
  mode: 'block',
  markers: MY_MARKERS,
  coreVersion: '0.1.0',
});
```

The parser is marker-agnostic; it works with any begin/end pair.

## Troubleshooting

**Managed section keeps disappearing:** Another writer is overwriting the file without using managed blocks. All writers must use `updateManagedSection()`.

**Cleanup flag won't go away:** There's still duplicate content in the user zone. Search for text from the managed section below the END marker and remove it.

**Lock errors in logs:** Usually transient; the lock is retried automatically (up to 5 times). If persistent, check for zombie processes holding the lock file (`*.lock` next to the managed file). The 2-minute stale threshold means orphaned locks auto-expire.

**Version stamp not advancing:** The library version is inlined at build time via `@rollup/plugin-replace` from `package.json`. If you're developing locally with `npm link`, the version may be `__JEEVES_CORE_VERSION__` (the unsubstituted placeholder) or `0.0.0` (the fallback). This is normal in development.

**Write failures are non-fatal:** `updateManagedSection` catches errors and logs a warning rather than throwing. Writer cycles are periodic, so a transient failure is recovered on the next cycle.
