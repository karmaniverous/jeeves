# Spec-to-Code Development Practice

This document defines how developer and AI assistant collaborate to design, build, and ship software using the spec-driven process. It is the authoritative reference for the iterative development practice used across all Jeeves platform components.

## 1. The Spec Format

Every product has a single spec file (`spec.md`) that serves as the source of truth for what exists, what's being built, and what's been decided.

### Section Reference

| Section | Purpose | Mutability |
|---------|---------|------------|
| **Overview** | What it is, what it isn't, boundaries | Stable after v1 |
| **Vision** | Architecture, component relationships | Evolves slowly |
| **Current Version** | What's shipped and working | **Locked** during Next Version design |
| **Next Version** | Active design space — scope, architecture, decisions, dev plan | Active |
| **Backlog** | Future work candidates | Append-only between versions |
| **Open Questions** | Unresolved issues | Resolve inline, don't delete |
| **Superseded Documents** | Historical record | Append-only |

### Locking Discipline

- **Current Version** is frozen while Next Version is in progress. It reflects reality, not aspirations.
- **Design Decisions** are append-only. Once recorded, a decision is immutable. To revise, add a new decision that supersedes the old one and cross-reference both.
- **Dev Plan tasks** move from Incomplete to Complete. They are not deleted or renumbered.

### Decision Format

Decisions are numbered sequentially and never reordered:

```markdown
#### Decision N: {Title}

{Description of the decision, rationale, alternatives considered, and consequences.
Include enough context that someone reading this six months later understands WHY,
not just WHAT.}
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

**Output:** A complete Dev Plan (Incomplete table) with numbered tasks and dependency chains.

**Convergence signal:** Every architectural element maps to at least one task. Every task has clear inputs and outputs. No circular dependencies.

### Stage 3: Implementation

**Goal:** Execute the dev plan, task by task.

**Activities:**
- Work through tasks in dependency order
- For each task: branch, implement, test, commit, push
- Record any new decisions discovered during implementation
- Move completed tasks from Incomplete to Complete

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
- Verify that managed content (TOOLS.md sections, skills) reflects new capabilities
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
- Update Current Version to match what shipped
- Promote backlog items to the new Next Version (developer's choice)
- Close resolved Open Questions
- Add any new backlog items discovered during implementation

**Output:** A clean spec ready for the next design cycle.

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
- **Spec drift:** Implementing something different from what the spec says without updating the spec. The spec is the contract — if reality diverges, update the spec.
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

- [ ] Dev Plan: all tasks in Complete
- [ ] Open Questions: none blocking this release
- [ ] Verification Checklist: all items checked
- [ ] Design Decisions: no unrecorded decisions from implementation

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
