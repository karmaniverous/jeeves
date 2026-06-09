---
name: jeeves-coding
description: Engineering standards for all code work. Use when writing code, reviewing PRs, spawning coding sub-agents, or making architectural decisions in any project (not just Jeeves). Covers design-first development, schema-first patterns, testing, dependency management, and pre-PR checklist.
---

# Engineering Standards

These standards apply to ALL code work — whether done directly or via sub-agents.
When spawning sub-agents for coding tasks, include the relevant rules in the task prompt.
Sub-agents don't inherit your context — if you don't pass the rules, they don't exist.

---

## Design-First Development

1. **Iterate on design until convergence** — Summarize requirements, propose approach, raise questions BEFORE writing code.
2. **Services-first architecture** — Core logic in services behind ports; adapters thin; side effects at boundaries.
3. **Schema-first** — Runtime schema (Zod) is source of truth; TypeScript types derived via `z.infer<>`; validation centralized. Plain TypeScript `interface` declarations for config surfaces are not acceptable.
4. **300 LOC hard limit** — If a file would exceed 300 lines, stop and decompose first. No exceptions.
5. **Avoid `any`** — Prefer `unknown` + narrowing; if unavoidable, narrowest scope + rationale.
6. **Test pairing** — Every non-trivial module gets a `*.test.ts`.
7. **Open-source first** — Prefer established deps over home-grown solutions. Search npm/GitHub before building anything non-trivial.

## Module Design

- **Single Responsibility** applies to modules as well as functions.
- Prefer many small modules over a few large ones.
- Keep module boundaries explicit and cohesive; avoid "kitchen-sink" files.
- Co-locate tests with modules for discoverability.

## Config Surfaces

- Define config with **Zod schemas** — never bare TypeScript interfaces.
- Derive types: `type MyConfig = z.infer<typeof myConfigSchema>`
- Generate **JSON Schema** from Zod for IDE DX (`$schema` pointer in config files).
- Validate at load time — fail fast with clear error messages.
- `init` commands generate config with `$schema` pointer already in place.

## Testing

- **Unit tests** for pure services (no fs/process/network).
- **Integration tests** for adapters/seams (minimal end-to-end slices).
- Exercise happy paths AND representative error paths.
- Table-driven cases encouraged for exhaustive coverage.
- Keep coverage meaningful — prefer covering branches/decisions over chasing 100% lines.

## Quality Gate Tooling

Run the repo's quality gate suite **before** each commit. All checks must pass before you commit.

- **Push after every commit.** Don't accumulate unpushed local commits. The owner needs to be able to see your work at any time.
- All quality gates must pass before claiming work is complete.

## Cross-Package Verification

When changes affect exports consumed by another repo:
- Standalone scripts passing ≠ "ready for review."
- Use `npm link` or equivalent to verify the consumer builds against your changes.
- Only claim completion when BOTH repos pass.

## Dependencies: Latest Versions Required (HARD GATE)

**NEVER use a superseded version of ANY dependency without direct human authorization.** When adding a new dependency — or creating a new project — ALWAYS check the latest stable version and use it. This applies to runtime deps, dev deps, and peer deps alike.

- Before `npm install <package>`: run `npm view <package> version` (or check npmjs.com) to confirm you're installing the current major.
- Before spawning sub-agents that install packages: include the latest version in the task prompt, or instruct the sub-agent to verify latest before installing.
- If the latest major has known breaking issues that block adoption, flag it to the human — don't silently pin an old major.

LLMs are trained on stale data. Your training cutoff means you will default to old versions of everything. **Assume your version knowledge is wrong** and verify before every install.

*Earned: 2026-05-12, created the jeeves-tools repo with Zod 3 despite Zod 4 being available since mid-2025. Shipped 84 commits on the old major before catching it.*

## Dependencies: Local Over Global

- **Dev dependencies belong in the project, not the global environment.** Install with `npm install --save-dev`, not `npm install -g`.
- This guarantees reproducibility across machines and CI. Global installs mask environment differences that cause "works on my machine" failures.
- **Rare exceptions:** Tools that are genuinely machine-level utilities (e.g. `stan-cli`). If in doubt, install locally.
## Dependency Failures

When a third-party dependency is broken:
1. Summarize the failure concisely.
2. Enumerate options: switch dependency → fix upstream → temporary pin → shim (last resort).
3. Recommend with rationale.
4. Do NOT immediately code around the problem.

## CHANGELOG

- **Do not manually update CHANGELOG.md** — it is generated as part of the release process (e.g. via `standard-version`, `changesets`, or equivalent). Conventional commit messages are the input; the tooling produces the output.

## Pre-PR Checklist (HARD GATE)

**Before creating ANY PR, run the full verification sequence. No exceptions.**

1. Run the repo's quality gate suite (lint, typecheck, test, build — or whatever the repo defines).
2. In monorepos: run checks **from each package directory**, not just the root. Root-level runs may mask package-level failures due to config resolution differences.
3. Exercise the release path: check `release-it` hooks (or equivalent) in each releasable package — run the same commands (`lint`, `typecheck`, `test`, `build`) from the same cwd the release process uses.

If any step fails, fix it before committing. Do NOT create the PR and "note" the failures. Do NOT claim pre-existing failures without having actually run the commands first. Skipping this sequence is how we ship broken code and fabricate diagnoses.

- **Compare against canonical template** (`karmaniverous/npm-package-template-ts`) before any npm package PR. If the project is behind the template, update it to conform. If the template is behind the project, raise the issue with Jason for template upkeep.
- **Run `ncu --peer`** before any PR. Review the output. Update safe patches/minors. **Flag major version bumps for discussion** — never auto-apply `ncu -u` without reading what changed. Peer dep conflicts must be resolved, not ignored.
- When spawning sub-agents, include `ncu --peer` in the quality gate commands: `ncu --peer && npm run lint && npm run typecheck && npm run build && npm test`. The sub-agent should report `ncu` output and only apply updates that don't involve major bumps or peer conflicts.
- **Resolve ALL script warnings.** It is NOT acceptable to release code with outstanding warnings. They exist for a reason — fix them.
- **Typecheck/lint rules apply to ALL authored code**, including configs at project root (`eslint.config.ts`, `rollup.config.ts`, `vitest.config.ts`, etc.). Only generated code (e.g. typedoc output) should be excepted from code quality checks.
- **Never disable lint/typecheck rules** without surfacing it for discussion first. Disabled rules are a major code smell. If a rule must be disabled, document the rationale inline at the point of suppression.
- **Multiple tsconfigs are a code smell.** Sometimes needed, but often they paper over poor configuration choices. Fix root causes rather than adding tsconfig variants.
- **In a TS repo, all scripts should be authored in TS** (not JS). Prefer execution with `tsx`.
- **Clean-room verify before claiming "all green."** Run `rimraf node_modules && npm install && npm run build` (or equivalent) to catch issues masked by cached state. If someone reports an error you can't reproduce, assume your cache is lying — not that they're wrong.
- Verify build, test, and lint pass after updates.

## Dev Workspace

- **Clone location:** `D:\repos\{org-or-userid}\{repo}` (e.g. `D:\repos\karmaniverous\jeeves-watcher`)
- D drive is the dev workspace. Do not clone repos elsewhere.
- Fresh clones are preferred over copying existing checkouts — `npm install` from registry is faster than disk-copying `node_modules`.
- D drive is NOT indexed by jeeves-watcher. Dev work stays off the archive.

## GitHub Auth (HARD GATE)

- **ALL GitHub operations use `jgs-jeeves` auth.** Set `GH_TOKEN` before any `gh` CLI command:
  ```powershell
  $env:GH_TOKEN = (Get-Content "J:\config\credentials\github\jgs-jeeves.token" -Raw).Trim()
  ```
- Never write to GitHub as `karmaniverous` — that's Jason's account.
- If `jgs-jeeves` lacks permissions, **escalate to Jason** rather than falling back to `karmaniverous`.

## Issue Hygiene

- **Always comment rationale when closing an issue without resolution** (duplicate, won't-fix, obsolete). The close action alone doesn't explain why.
- Reference the replacement issue/PR when closing as duplicate.

## Code Style

- Prettier is source of truth for formatting.
- Keep imports sorted per repo tooling.
- Avoid dead code.
- TSDoc `@module` or `@packageDocumentation` on every non-test module.
- First 160 chars of module doc should be high-signal: what it does, IO/side effects, traversal hints.

## eslint-disable is a HARD GATE

Never disable lint/typecheck rules without surfacing it for discussion first. Fix the code, don't suppress the warning. For test mocks, use properly typed partial objects (`Partial<RealType>`, typed `MockReply` interfaces) instead of `any`. Tests are code.

## Git Merge Policy

- **No squash merges.** Preserve commit history.
- **PR reviewer:** When creating a PR under `jgs-jeeves` auth, always add `karmaniverous` (Jason) as a reviewer.
