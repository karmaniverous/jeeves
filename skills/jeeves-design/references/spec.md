---
title: '{package-name} — Product Specification'
version: '{next-version}'
date: YYYY-MM-DD
status: Pre-version (design)
authors:
  - '{author}'
previous: '{previous-spec-filename}'
---

# {package-name} — Product Specification

<!-- Template notes (delete this comment when creating a spec):
  - Keep only the sections this spec needs. Never leave placeholder stubs.
  - Record decisions, constraints, and open questions: what shapes future work.
    Not implementation detail the code already states, status, or conversation.
  - Frontmatter: `version` is the version being designed in Next Version;
    `status` is one of Pre-version (design), In progress, Complete, Archived. -->

## Spec Discipline

> 🔒 **Locked.** No edits. Route changes elsewhere (see below).

**Section states.** Every governed section starts with a banner:

- 🔒 **Locked:** no edits.
- ➕ **Append-only:** add entries; never modify existing ones (except a dev-plan row's Status/Ticket, a "Superseded by" note on a decision, or a resolution note on an Open Question).
- ✏️ **Open:** edit with targeted changes.

Only the developer changes a state, on explicit instruction; every change is appended to the Lock Log.

**Editing.** Change this spec only by targeted edits of specific passages, never whole-file rewrites (except the developer-approved release reconciliation). Before an edit, read the target section's banner. After an edit, review the diff: every change must be in an open section, or a pure addition in an append-only one. If a locked section changed, undo it and relocate the content.

**Where does this go?**

| You have… | It goes… |
| --- | --- |
| New design or detail | Next Version |
| Shipped behaviour that's wrong | A bug or an Open Question, never an edit to Current Version |
| A change of mind | A new decision superseding the old one |
| Something unresolved | Open Questions (`Q1`, `Q2`, …) |
| Anything that seems to need a locked section | Stop and ask the developer |

**Release.** When Next Version is implemented, the whole spec is frozen (locked) for the release gate. On green: archive as `spec-v{version}.md`; rewrite Current Version once (developer-approved) to match what shipped and re-lock it; start the next Next Version from promoted Backlog items.

## 1. Overview

> ✏️ **Open.** Edit with targeted changes.

<!-- What it is, what it is not, boundaries. Repo, package, license, CLI (if any). -->

<!-- prettier-ignore -->
**Repo:** `@karmaniverous/{package-name}`
**npm:** `@karmaniverous/{package-name}`
**License:** BSD-3-Clause

### What {package-name} Is

- {primary purpose}

### What {package-name} Is Not

- {explicit non-goals}

## 2. Vision

> ✏️ **Open.** Edit with targeted changes.

<!-- Architecture diagram (PlantUML recommended) and narrative: how this fits the broader system.
     If part of a platform, a component table: | Component | Role | Current Version | -->

## 3. Current Version

> 🔒 **Locked.** No edits. Route changes elsewhere (see Spec Discipline).

<!-- What is shipped and working. Rewritten only at release reconciliation. -->

No current version. {package-name} has not yet been built.

## 4. Next Version: {version}

### Scope

> ✏️ **Open.** Edit with targeted changes.

**In scope:**

1. {feature}

**Out of scope:**

- {deferred feature}

### Architecture

> ✏️ **Open.** Edit with targeted changes.

<!-- Structure, dependency model, key interfaces, data flow, config schema. Only what the code won't make obvious. -->

### Design Decisions

> ➕ **Append-only.** Add entries; never modify existing ones.

<!-- Numbered in sequence, never renumbered. To revise, append a new decision with
     "Supersedes Decision N" and add "Superseded by Decision M" to the old one. -->

#### Decision 1: {Title}

- **Context:** {what forced the choice; "Resolves Q#" if it answers an Open Question}
- **Choice:** {what was decided}
- **Rationale:** {why}
- **Rejected:** {alternatives and why not}
- **Consequences:** {what this commits us to}

### Dev Plan

> ➕ **Append-only.** Add rows; change only a row's Status or Ticket.

<!-- The work list, in dependency order. Status: todo, done, or dropped (cite the decision).
     Ticket: only when a ticket exists (item shelved or assigned to someone else). -->

| #   | Task   | Depends On | Status | Ticket |
| --- | ------ | ---------- | ------ | ------ |
| 1   | {task} | —          | todo   |        |
| 2   | {task} | 1          | todo   |        |

### Release Sequence

> ✏️ **Open.** Edit with targeted changes.

1. {step}

### Verification Checklist

> ✏️ **Open.** Edit with targeted changes.

- [ ] {testable assertion}

## 5. Backlog

> ➕ **Append-only.** Add entries; never modify existing ones.

<!-- Candidates for a future Next Version. Brief; detailed design happens when promoted. -->

- **{Feature name}** — {brief description}

## 6. Open Questions

> ➕ **Append-only.** Add entries; never modify existing ones.

<!-- IDs never reused. Resolve by striking through and citing the decision:
     - ~~**Q1:** {question}~~ → Decision N -->

- **Q1:** {question}

## 7. Superseded Documents

> ➕ **Append-only.** Add entries; never modify existing ones.

| Document | Date | What It Covered |
| -------- | ---- | --------------- |

## Lock Log

> ➕ **Append-only.** Add entries; never modify existing ones.

| Date | Section | From → To | Reason |
| ---- | ------- | --------- | ------ |
