---
title: "{package-name} — Product Specification"
date: YYYY-MM-DD
status: Pre-version (design)
authors:
  - {author}
spec-version: "{next-version}"
previous: "{previous-spec-filename}"
---

# {package-name} — Product Specification

<!-- Spec Discipline:
  1. Current Version stays locked during Next Version design
  2. Next Version is the active design space
  3. When Next Version is implemented: freeze the spec, run the verification checklist
  4. On green: archive spec as spec-v{next}.md, update Current Version to match reality,
     promote backlog items to Next Version
-->

## Spec Discipline

1. **Current Version** stays locked during Next Version design
2. Next Version is the active design space
3. When Next Version is implemented: freeze the spec, run the checklist
4. On green: archive spec as `spec-v{next}.md`, update Current Version to match reality, promote backlog items to Next Version

## Spec Hygiene

- **Frontmatter is mandatory.** Every spec must have `version`, `date`, and `status` fields in the YAML frontmatter. The `status` field tracks the spec lifecycle: `Pre-version (design)`, `In progress`, `Complete`, `Archived`.
- **Decisions are numbered.** Use sequential numbering (`Decision 1`, `Decision 2`, ...) so they can be cross-referenced from dev plan tasks, other decisions, and external documents. Never renumber — append only.
- **Dev plan tasks have dependency ordering.** Every task in the dev plan table must have a `Depends On` column referencing prerequisite task numbers (or `—` for none). Tasks should be ordered so dependencies come first. This enforces implementation sequencing and makes parallel work visible.

## 1. Overview

<!-- What is this package? What problem does it solve? What are its boundaries?
     Include: repo, npm package name, license, CLI command (if any).
     Clearly state what it IS and what it IS NOT. -->

**Repo:** `@karmaniverous/{package-name}`
**npm:** `@karmaniverous/{package-name}`
**License:** BSD-3-Clause

### What {package-name} Is

- {primary purpose}

### What {package-name} Is Not

- {explicit non-goals}

## 2. Vision

<!-- High-level architecture diagram (PlantUML recommended) and narrative.
     How does this component fit into the broader system?
     Include a component/capability table if relevant. -->

### Platform Components

<!-- If this is part of a larger platform, list all components with roles and versions. -->

| Component | Role | Current Version |
|-----------|------|-----------------|
| **{component}** | {role} | {version} |

## 3. Current Version

<!-- Lock this section once Next Version design begins.
     Document what is currently shipped and working.
     If no version has shipped yet: "No current version. {package-name} has not yet been built." -->

No current version. {package-name} has not yet been built.

## 4. Next Version: {version}

| Package | Version |
|---------|---------|
| `@karmaniverous/{package-name}` | {version} |

### Scope

<!-- What's in scope for this version? What's explicitly out of scope?
     Be precise — this is the contract. -->

**In scope:**
1. {feature}

**Out of scope (Phase 2+):**
- {deferred feature}

### Architecture

<!-- Detailed technical design. Include:
     - Package/directory structure
     - Dependency model
     - Key interfaces and APIs
     - Data flow diagrams
     - Configuration schema -->

### Design Decisions

<!-- Numbered for reference. New decisions append; existing decisions are immutable once recorded.
     Format:

     #### Decision N: {Title}

     {Description of the decision, rationale, alternatives considered, and consequences.}

     Each decision is a permanent record. If a decision needs to be revised, add a new decision
     that supersedes it and note the supersession in both. -->

#### Decision 1: {Title}

{Decision description and rationale.}

### Dev Plan

<!-- Two tables: Complete and Incomplete. Tasks are numbered for reference.
     Dependencies reference task numbers. Move tasks from Incomplete to Complete
     as they are implemented. -->

#### Complete

<!-- | # | Task | Depends On |
     |---|------|------------|
     | 1 | {completed task} | — | -->

*No tasks completed yet.*

#### Incomplete

| # | Task | Depends On |
|---|------|------------|
| 1 | {task description} | — |
| 2 | {task description} | 1 |

### Release Sequence

<!-- Ordered list of release steps. What gets published first?
     What can be parallel? What must be serial? -->

1. {step}

### Verification Checklist

<!-- Concrete, testable assertions that must all pass before the version ships.
     Format: - [ ] {assertion} -->

- [ ] {verification item}

## 5. Backlog

<!-- Future work not scoped to any specific version. Items here are candidates
     for promotion to the next Next Version. Brief descriptions only —
     detailed design happens when promoted. -->

- **{Feature name}** — {brief description}

## 6. Open Questions

<!-- Numbered questions that need resolution. When resolved, strike through
     and note the resolution inline (don't delete — the history is valuable).
     Format:
     1. ~~{Question}~~ Resolved by Decision N: {brief summary}
     2. {Open question still needing resolution} -->

1. {question}

## 7. Superseded Documents

<!-- Documents that this spec replaces or incorporates. Keep for historical reference.
     Format:
     | Document | Date | What It Covered |
     |----------|------|-----------------|
     | {filename} | YYYY-MM-DD | {description} | -->

*No superseded documents.*
