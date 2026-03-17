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
1. **Boundary** — clearly separate managed from user content
2. **Version stamp** — track which library version last wrote this block
3. **Human signal** — "DO NOT EDIT" warns against manual changes inside the block

### Two Modes

The `updateManagedSection()` function supports two modes:

**Block mode** — replaces the entire managed block. Used for SOUL.md and AGENTS.md, where core owns all the managed content.

```typescript
await updateManagedSection(filePath, content, {
  mode: 'block',
  markers: SOUL_MARKERS,
  coreVersion: '0.1.0',
});
```

**Section mode** — upserts a named H2 section within the managed block. Used for TOOLS.md, where multiple components each contribute independent sections.

```typescript
await updateManagedSection(filePath, sectionContent, {
  mode: 'section',
  sectionId: 'Watcher',
  markers: TOOLS_MARKERS,
  coreVersion: '0.1.0',
});
```

In section mode, sections are always rendered in stable order (Platform, Watcher, Server, Runner, Meta) regardless of write sequence. An H1 title is prepended when the markers include a `title` property.

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
| My version ≥ stamped version | Write — I'm current or newer |
| My version < stamped, stamp is fresh | Skip — a newer version is maintaining this |
| My version < stamped, stamp is stale | Write — the newer plugin was probably uninstalled |

**Staleness threshold:** 5 minutes (configurable). Well above any prime-interval cycle.

**Important:** Version-stamp convergence only applies in block mode (SOUL.md, AGENTS.md). In section mode (TOOLS.md), each component always writes its own section — the stamp doesn't gate individual section writes.

## Cleanup Detection

When the writer enters fresh-file mode (markers missing), existing content gets pushed to the user zone. If that content was actually managed content from a previous installation, it creates duplication — the same material exists both inside and below the managed block.

Jeeves detects this using **Jaccard similarity on 3-word shingles**:

1. Generate the set of all 3-word sequences from the managed content
2. Generate the set of all 3-word sequences from the user content
3. Compute Jaccard similarity (intersection / union)
4. If similarity exceeds 0.15, inject a cleanup flag

The cleanup flag appears inside the managed block:

```markdown
> ⚠️ CLEANUP NEEDED: Orphaned Jeeves content may exist below this managed section.
> Review everything after the END marker and remove any content that duplicates
> what appears above.
```

The flag is self-clearing: once the duplicate content is removed (by the assistant or manually), the similarity score drops below the threshold and the flag disappears on the next write cycle.

## File Locking

All managed content writes use file-level locking via `proper-lockfile`. This prevents corruption when multiple ComponentWriter instances (from different plugins) write to the same file simultaneously.

The lock has a 2-minute stale threshold — if a process crashes while holding the lock, the next writer can recover after 2 minutes. Under normal operation, locks are held for milliseconds.

Writes are atomic: content is written to a temporary file, then renamed over the target. This prevents partial writes from corrupting the file.

## Extending with Custom Markers

You can use the managed content system for your own files by providing custom markers:

```typescript
const MY_MARKERS = {
  begin: 'BEGIN MY CUSTOM SECTION',
  end: 'END MY CUSTOM SECTION',
  title: 'My Custom Title',  // optional — adds H1 in section mode
};

await updateManagedSection(myFilePath, content, {
  mode: 'block',
  markers: MY_MARKERS,
  coreVersion: '0.1.0',
});
```

The parser is marker-agnostic — it works with any begin/end pair.

## Troubleshooting

**Managed section keeps disappearing:** Another writer is overwriting the file without using managed blocks. All writers must use `updateManagedSection()`.

**Cleanup flag won't go away:** There's still duplicate content in the user zone. Search for text from the managed section below the END marker and remove it.

**Lock errors in logs:** Usually transient — the lock is retried automatically. If persistent, check for zombie processes holding the lock file (`*.lock` next to the managed file).

**Version stamp not advancing:** The library version is read from `package.json` at import time. If you're developing locally with `npm link`, the version may be `0.0.0`. This is normal in development.
