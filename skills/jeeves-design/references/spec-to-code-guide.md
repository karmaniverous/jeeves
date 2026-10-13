# Spec-to-Code Development Practice

This document defines how developer and AI assistant collaborate to design, build, and ship software using the spec-driven process. It is the authoritative reference for the iterative development practice used across all Jeeves platform components.

## 1. The Spec Format

A product that needs a spec (see the `jeeves-design` skill: _Do You Need a Spec?_) has a single spec file (`spec.md`), usually a plain document in a corpus. It memorializes the conclusions of design discussion (what exists, what's being built, what's been decided) and is read first by every thread that works on the product. It is the source of work items: the dev plan is the work list.

### Section Reference

| Section | Purpose | Default state |
| --- | --- | --- |
| **Spec Discipline** | States, edit rules, routing table | 🔒 Locked |
| **Overview** | What it is, what it isn't, boundaries | ✏️ Open (stable after v1) |
| **Vision** | Architecture, component relationships | ✏️ Open (evolves slowly) |
| **Current Version** | What's shipped and working | 🔒 Locked; rewritten only at release reconciliation |
| **Next Version** | Scope, Architecture, Release Sequence, Verification Checklist | ✏️ Open (Scope/Architecture may lock at end of Stage 2) |
| ↳ **Design Decisions** | Numbered decisions | ➕ Append-only |
| ↳ **Dev Plan** | The work list | ➕ Append-only (Status/Ticket editable) |
| **Backlog** | Future work candidates | ➕ Append-only between versions |
| **Open Questions** | Unresolved issues (`Q1`, `Q2`, …) | ➕ Append-only (resolve inline, don't delete) |
| **Superseded Documents** | Historical record | ➕ Append-only |
| **Lock Log** | State changes | ➕ Append-only |

Omit sections a spec doesn't need. Never fill the template for completeness.

### Locking Discipline

The lock lives in the document itself; no tooling is required.

- **Banners.** Every governed section starts with a one-line banner stating its state: 🔒 locked (no edits), ➕ append-only (add entries, never modify existing ones), ✏️ open.
- **Who changes a state.** Only the developer, on explicit instruction. Each change is appended to the Lock Log (date, section, from → to, reason).
- **Lifecycle.** Current Version is locked while Next Version is designed; it reflects reality, not aspirations. At release reconciliation it is rewritten once (developer-approved) to match what shipped, then re-locked. Scope and Architecture may lock at the end of Stage 2 if the developer says so. "Frozen" during the release gate means the whole spec is locked.
- **Edit discipline.** Change a spec only by targeted edits of specific passages, never whole-file rewrites (except creating a spec and the approved reconciliation). Read the target section's banner before editing; review the diff after. If anything touched a locked section, undo it and relocate the content (the skill's _Where Does This Go?_ table says where). A document store's version history (e.g. jeeves-watcher) can help review changes, but is optional.
- **Design Decisions** are append-only. To revise, add a new decision that supersedes the old one and cross-reference both.
- **Dev Plan rows** are never deleted or renumbered; only Status (todo, done, dropped) and Ticket change.

### Decision Format

Decisions are numbered sequentially and never reordered. Keep them compact, with enough context that someone reading six months later understands WHY, not just WHAT:

```markdown
#### Decision N: {Title}

- **Context:** {what forced the choice; "Resolves Q#" if it answers an Open Question}
- **Choice:** {what was decided}
- **Rationale:** {why}
- **Rejected:** {alternatives and why not}
- **Consequences:** {what this commits us to}
```

Key principles:

- **Append-only.** New decisions get the next number. Existing decisions are never edited.
- **Supersession.** If Decision 5 replaces Decision 2, Decision 5 says "Supersedes Decision 2" and Decision 2 gets a note: "Superseded by Decision 5."
- **Rationale is mandatory.** A decision without rationale is just an opinion. Include what was considered and why this path was chosen.

## 2. The 7-Stage Iterative Process

### Stage 1: High-Level Design

**Goal:** Establish scope, architecture, and key design decisions for the next version.

**Activities:**

- Define what's in scope and what's explicitly out
- Draft architecture (package structure, dependency model, key interfaces)
- Record initial design decisions
- Identify open questions

**Output:** A populated Next Version section with Scope, Architecture, initial Decisions, and a skeletal Dev Plan.

**Who drives:** Developer sets direction; assistant drafts, proposes, and challenges.

### Stage 2: Detailed Design & Dev Plan

**Goal:** Break the architecture into concrete, sequenced tasks with explicit dependencies.

**Activities:**

- Decompose architecture into implementable tasks
- Identify dependencies between tasks (which must complete before which)
- Estimate complexity and sequence for optimal flow
- Resolve open questions that block task definition

**Output:** A complete Dev Plan with numbered tasks and dependency chains. The dev plan is the work list: tickets are not needed for it. Open a ticket only for an item that won't be completed synchronously with the dev plan (shelved for later, or assigned to someone else); record it in the row's Ticket column and link the ticket back to its spec section and decisions.

**Convergence signal:** Every architectural element maps to at least one task. Every task has clear inputs and outputs. No circular dependencies. If the developer says so, Scope and Architecture lock here (logged in the Lock Log).

### Stage 3: Implementation

**Goal:** Execute the dev plan, task by task.

**Activities:**

- Work through tasks in dependency order
- For each task: branch, implement, test, commit, push
- Record any new decisions discovered during implementation (one-way rule: a design problem goes back into the spec as an Open Question or superseding decision before work continues)
- Mark completed tasks `done`

**Workflow per task:**

1. Confirm task scope and acceptance criteria
2. Create branch (if not already on a feature branch)
3. Implement with tests
4. Run all quality checks (lint, typecheck, test)
5. Commit with meaningful message referencing the task number
6. Push immediately

**Output:** Working code, passing tests, updated Dev Plan.

### Stage 4: Integration & Verification

**Goal:** Verify that the implemented code meets the spec's verification checklist.

**Activities:**

- Run the full verification checklist from the spec
- Fix any failures (new tasks if needed)
- Integration testing across component boundaries
- Performance and edge-case validation

**Output:** All checklist items passing. Any new issues tracked as tasks.

### Stage 5: Documentation & Content

**Goal:** Ensure all documentation reflects the implemented reality.

**Activities:**

- Update README, CHANGELOG, API docs
- Verify that shipped content (skills, prompt rules) reflects new capabilities
- Update spec to reflect any implementation-time decisions

**Output:** Documentation that matches code. No stale references.

### Stage 6: Release

**Goal:** Ship the version.

**Activities:**

- Final quality gate pass (Stage 4 checklist, all green)
- Version bump (semver)
- Publish to npm (or equivalent)
- Create GitHub release with changelog
- Tag the commit

**Gate:** Developer explicitly approves the release. The assistant prepares but does not execute without approval (Release & Deployment Gate).

### Stage 7: Release Reconciliation

**Goal:** Update the spec to reflect the shipped reality and prepare for the next cycle.

**Activities:**

- Archive the spec as `spec-v{version}.md`
- Rewrite Current Version once, with developer approval, to match what shipped; then re-lock it (Lock Log entry)
- Promote backlog items to the new Next Version (developer's choice)
- Close resolved Open Questions
- Add any new backlog items discovered during implementation
- If the shipped Next Version leaves an empty Backlog and no Open Questions, propose retiring the spec (fold what remains into README/docs)

**Output:** A clean spec ready for the next design cycle, or a retired one.

## 3. Convergence Loop Patterns

Design and implementation are not strictly linear. Within each stage, the developer and assistant iterate until convergence.

### The Basic Loop

```
Developer states intent
  → Assistant proposes design/implementation
    → Developer reviews, challenges, redirects
      → Assistant revises
        → Repeat until convergence
          → Record decision / commit code / move task
```

### Convergence Signals

- **Design convergence:** No more open questions blocking the next stage. All stakeholders agree on the approach.
- **Implementation convergence:** Tests pass, lint clean, typecheck clean, task acceptance criteria met.
- **Spec convergence:** Every implemented feature maps to a spec section. Every spec assertion is verifiable.

### Anti-Patterns

- **Premature implementation:** Writing code before the design is stable. If you're still debating the interface, don't implement it.
- **Spec drift:** Implementing something different from what the spec says without updating the spec. The spec is the contract: if reality diverges, route it into the spec (Next Version, Open Question, or superseding decision) first.
- **Trivial specs:** A spec for work that fits in an issue, a spec per ticket, sections filled for completeness, or implementation detail and status chatter the code or tracker already holds. If a spec feels like overhead, say so and propose trimming or retiring it.
- **Editing locked sections:** Changing Current Version or another locked section, or rewriting a whole spec. Use targeted edits, check the banner first and the diff after, and route locked-section changes elsewhere.
- **Decision avoidance:** Leaving open questions open because they're hard. If a question blocks progress, escalate it — don't work around it.
- **Gold plating:** Adding features not in the current scope. Backlog them. Ship what was planned.

## 4. Release Gate Passes

Before any release, these gates must pass:

### Quality Gate

- [ ] All tests pass
- [ ] Zero lint errors AND zero lint warnings
- [ ] Zero typecheck errors
- [ ] All verification checklist items from the spec pass

### Documentation Gate

- [ ] README reflects current capabilities
- [ ] CHANGELOG updated with all changes
- [ ] API documentation current
- [ ] Breaking changes documented with migration guide

### Spec Gate

- [ ] Dev Plan: every task `done` or `dropped`
- [ ] Open Questions: none blocking this release
- [ ] Verification Checklist: all items checked
- [ ] Design Decisions: no unrecorded decisions from implementation

The spec is frozen (whole spec locked) from here until reconciliation.

### Release Gate (requires explicit developer approval)

- [ ] Version bumped appropriately (semver)
- [ ] Published to registry
- [ ] GitHub release created
- [ ] Spec archived as `spec-v{version}.md`

## 5. Conversation Engine Patterns

The spec-to-code process is a conversation between developer and AI assistant. These patterns describe how that conversation works effectively.

### The Proposal Pattern

The assistant's default mode for design work:

1. **Understand** the developer's intent (ask clarifying questions if ambiguous)
2. **Propose** a concrete design with rationale
3. **Present** trade-offs and alternatives considered
4. **Wait** for feedback before proceeding

Never assume silence is approval. Explicit confirmation before recording decisions or beginning implementation.

### The Checkpoint Pattern

At natural boundaries (end of a stage, completion of a complex task, before a risky action):

1. **Summarize** what was accomplished
2. **State** the current position in the process
3. **Propose** the next step
4. **Confirm** before proceeding

This keeps the developer oriented and prevents runaway work in the wrong direction.

### The Discovery Pattern

When implementation reveals something the design didn't anticipate:

1. **Stop** — don't improvise a solution
2. **Report** what was discovered and why it matters
3. **Propose** options (including "do nothing and backlog it")
4. **Record** the decision if one is made
5. **Continue** with the updated understanding

Discoveries during implementation are normal and valuable. They become design decisions, not silent workarounds.

### The Escalation Pattern

When the assistant hits something it can't resolve:

1. **State** what was attempted
2. **Explain** why it's blocked
3. **Present** the options as understood
4. **Ask** for direction

Never go dark. Never guess. The developer always has more context than the assistant about business priorities, political constraints, and acceptable trade-offs.
