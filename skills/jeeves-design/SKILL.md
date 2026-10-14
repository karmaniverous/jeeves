---
name: jeeves-design
description: >
  Spec-driven design process for deciding WHAT code to create. Use when deciding whether work needs a spec, creating or revising a product spec, planning a new version, making design or architecture decisions, breaking work into a dev plan, onboarding to a project, preparing a release, or when asked about the development process. Bundles the spec-to-code guide and a spec template.
---

# Design: Spec-Driven Development

This skill governs deciding **what** to build. The mechanics of building it (code standards, testing, quality gates, PR workflow) are in the `jeeves-coding` skill.

## Do You Need a Spec?

Write a spec when the work:

- crosses services or repos,
- spans several sessions or threads,
- involves design choices worth recording, or
- will be shelved or handed to others.

A small, clear, self-contained outcome needs **no spec**: just do it, under `jeeves-coding`. Design that fits in an issue description or comment goes there. Borderline: ask the developer, and default to no spec.

Before creating a spec, state the trigger in one line (e.g. "Spec: this spans jeeves-server and jeeves-runner and will run over several sessions.").

## What a Spec Is For

- **It memorializes conclusions.** A spec records what the developer and assistant concluded in design discussion (a small fraction of the conversation), not the conversation itself.
- **It is durable over time.** New concerns are integrated consistently with existing decisions, or explicitly supersede them.
- **It is durable across threads.** Every thread reads it first: the section states, Next Version, and Open Questions.
- **It is a source of work, not a product of a ticket** (unless you start from a very high-level ticket). The dev plan is the work list. Open a ticket only for an item not completed synchronously with the dev plan (shelved for later or assigned to someone else), and link it back to its spec section and decisions.
- **One-way rule.** Work executes the design. A design problem found during work goes back into the spec first (an Open Question, or a new decision that supersedes the old one), then the work continues.

## Keeping Specs Lean

- Never fill the template for completeness. Omit sections you don't need; no placeholder stubs.
- No spec per ticket. Specs sit above tickets.
- Record only what shapes future work: decisions, constraints, open questions. Leave out implementation detail the code already states, status chatter, and conversation.
- Routine work touches the spec only to tick dev-plan items.
- Retire a spec whose Next Version has shipped with an empty Backlog and no Open Questions; suggest folding what remains into the README or docs.
- If a spec starts to feel like overhead, say so and propose trimming or retiring it.

## Section States

Every governed section starts with a one-line banner stating its state:

<!-- prettier-ignore -->
```markdown
> 🔒 **Locked.** No edits. Route changes elsewhere (see the spec's Spec Discipline).
> ➕ **Append-only.** Add entries; never modify existing ones.
> ✏️ **Open.** Edit with targeted changes.
```

- **🔒 locked:** no edits.
- **➕ append-only:** add entries, never modify existing ones. Allowed on existing entries: a dev-plan row's Status/Ticket, a "Superseded by" note on a decision, a resolution note on an Open Question.
- **✏️ open:** editable.

Only the developer changes a state, and only on explicit instruction. Each change is appended to the spec's Lock Log (date, section, from → to, reason).

Lifecycle: Current Version is locked while Next Version is designed. At release reconciliation it is rewritten once (developer-approved) to match what shipped, then re-locked. Scope and Architecture may lock at the end of Stage 2 if the developer says so. "Frozen" during the release gate means the whole spec is locked.

## Edit Discipline

1. **Targeted edits only.** Change a spec by editing specific passages, never by rewriting the whole file. The only exceptions: creating a spec, and the developer-approved release reconciliation.
2. **Before an edit,** read the banner of the target section. If it is locked, don't edit; use the routing table below.
3. **After an edit,** review the tool's diff. Every change must fall in an open section, or be a pure addition in an append-only section. If anything touched a locked section, undo it and relocate the content.

## Where Does This Go?

| You have… | It goes… |
| --- | --- |
| New design or detail | Next Version |
| Shipped behaviour that's wrong | A bug or an Open Question. Never an edit to Current Version |
| A change of mind | A new decision that supersedes the old one |
| Something unresolved | Open Questions (`Q1`, `Q2`, …); the decision that resolves it cites the ID |
| Anything that seems to need a locked section | Stop and ask the developer |

## The Governing Process

The spec-to-code guide bundled with this skill is the governing development process: [`references/spec-to-code-guide.md`](references/spec-to-code-guide.md). Read it before doing design work. It defines the spec format and section states, decision format, the 7-stage lifecycle (high-level design; detailed design & dev plan; implementation; integration & verification; documentation & content; release; release reconciliation), convergence loops and anti-patterns, the release gate passes (the Release gate requires explicit developer approval), and the conversation patterns.

## When to Use

- **Creating a spec:** state the trigger, then start from the template [`references/spec.md`](references/spec.md), keeping only the sections you need.
- **Planning a version:** Stages 1–2 of the guide. Converge on scope, architecture, and decisions, then produce a dependency-ordered dev plan.
- **Making a design or architecture decision:** append it as a numbered decision, with rationale.
- **Onboarding to a project or starting a thread:** read the spec's section states, Next Version, and Open Questions before proposing changes.
- **Asked about the development process:** answer from the guide.

## Design Principles

1. **Iterate on design until convergence.** Summarize requirements, propose an approach, and raise questions BEFORE writing code. If the interface is still being debated, don't implement it.
2. **Services-first architecture.** Core logic lives in services behind ports. Adapters stay thin. Side effects happen at the boundaries.
3. **Open-source first.** Prefer established dependencies over home-grown solutions. Search npm/GitHub before designing anything non-trivial.
4. **Record, don't improvise.** When implementation reveals something the design didn't anticipate, stop, report it, propose options, and record the decision. Don't work around it silently.

## Handoff to Implementation

Stages 3–4 (implementation, integration & verification) and the quality and release gates are carried out under the `jeeves-coding` skill's engineering standards.
