---
name: operations
description: Operational knowledge for a Jeeves installation. Covers date formatting utilities, email pipeline architecture, curation signal protocol, label taxonomy, and data flow patterns. Use when working with date formatting, email scripts, debugging email pipeline issues, or understanding how human email actions are interpreted.
---

# Operations

Operational knowledge for the Jeeves platform. Covers email pipeline architecture, curation protocols, and operational conventions.

## Date Formatting

A `date-fns` wrapper lives at `{configRoot}/jeeves-core/scripts/src/lib/dates.ts`. It provides:

| Export | Purpose |
|--------|---------|
| `dayOfWeek(dateStr)` | Full weekday name for an ISO date string (e.g. `'Monday'`) |
| `formatDate(dateStr, fmt)` | Format with any date-fns pattern |
| `relativeDays(dateStr, refStr?)` | Human-friendly relative description (`'today'`, `'tomorrow'`, `'3 days ago'`) |
| `parseISO` / `format` | Re-exported from date-fns for direct use |

### Gateway session usage

From a gateway session, call via `exec`:

```
node -e "import { dayOfWeek } from './src/lib/dates.js'; console.log(dayOfWeek('2026-05-11'));"
```

with `workdir: {configRoot}/jeeves-core/scripts`.

Or use the simpler inline form when the full wrapper isn't needed:

```
node -e "import { format, parseISO } from 'date-fns'; console.log(format(parseISO('2026-05-11'), 'EEEE'));"
```

with `workdir: {configRoot}/jeeves-core/scripts` (so date-fns resolves from `node_modules`).

### Hard gate

NEVER state a day of the week without computing it first. LLMs cannot do day-of-week arithmetic reliably.

## Email Curation Signal Protocol

Defines how human email actions in Gmail are interpreted by Jeeves email processes.

### Human Signals

| Signal | Meaning | Action |
|--------|---------|--------|
| Label added | Human is adjusting Jeeves classification | Update domain process inputs to reflect new classification |
| Label removed | Human is adjusting Jeeves classification (removal) | Update domain process inputs to reflect removed classification |
| Archived → Inbox | Human wants to keep this email in sight | Add `watch` label via update queue |
| Starred / Flagged | Elevated attention — email is important in context | Domain processes should weight higher |
| Moved to Spam | Confirmed spam — human classified as junk | Learn from classification for future triage |
| Removed from Spam | False positive — human rescued from spam | Process as normal email, learn from false positive |

### Watch Label

The `watch` label has special semantics:
- When present, never auto-archive the email
- When a watched email lands in archive (by anyone), remove the watch label
- Added automatically when a human moves an archived email back to inbox

### Label Taxonomy

Labels applied by Jeeves processes fall into two categories:

**Mechanical labels** (applied by domain extractors with high confidence):
- `meeting` — meeting-related email (invite, notes, transcript)
- `finance` — financial email (receipt, invoice, billing, statement)

**Reasoning labels** (applied by Update Email Meta, requiring cross-domain context):
- `project/<name>` — associated with a known project
- `todo` — requires action or work from the user
- `reply` — someone is waiting on a response
- `alert` — automated notification from a service
- `readme` — newsletter or subscribed informational content

### Labeling Principles

1. Label at the earliest point where confidence is high enough
2. Domain extractors label what they know with certainty
3. Update Email Meta labels what requires cross-domain context
4. A thread can have multiple labels
5. Do not re-label threads that already have the label
6. **Prefer false negatives over false positives**

### Poll Scope

Query: `newer_than:1d in:anywhere`

Must include spam and trash to detect human curation signals (e.g., moving to/from spam).

## Email Pipeline Architecture

### Directory Layout

```
{configRoot}/jeeves-core/email-config.json  — pipeline configuration (accounts, buckets)
{workspace}/../email/threads/{account}/     — canonical email archive (thread.json + per-message JSONs)
```

### Data Flow

1. **Poll** (`email/poll.ts`) — searches Gmail for recent threads, classifies, enqueues important ones for metadata fetch
2. **Fetch** (`email/email-fetch.ts`) — fetches full thread metadata from Gmail, creates/updates `thread.json` cache, enqueues for body download
3. **Download** (`email/download.ts`) — downloads full message bodies, writes per-message JSONs to `threads/{account}/{threadId}/`
4. **Drain Updates** (`email/drain-updates.ts`) — applies label changes and other queued updates back to Gmail
5. **Meta synthesis** — jeeves-meta synthesizes email archives into searchable summaries

### thread.json (Cache Format)

Each `threads/{account}/{threadId}/thread.json` contains:
- `threadId`, `account`, `subject`, `participants`
- `messages` — record of `{ messageId → { from, to, cc, date, internalDateMs, labels, snippet, attachments } }`
- `provenance` — label change history
- `cachedAt`, `updatedAt`

### Per-Message JSONs

Each `threads/{account}/{threadId}/{messageId}.json` contains full message data:
- `messageId`, `threadId`, `account`, `subject`, `from`, `to`, `cc`
- `date` (RFC 2822), `internalDateMs` (epoch ms)
- `labels`, `body`, `attachments`, `downloadedAt`
