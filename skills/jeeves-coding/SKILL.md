---
name: jeeves-coding
description: >
  Engineering standards for the mechanics of writing code. Use when writing code, reviewing PRs, or spawning coding sub-agents. Covers core coding rules, schema-first patterns, testing, dependency management, and the pre-PR checklist. For deciding what to build, see jeeves-design.
---

# Engineering Standards

These standards apply to ALL code work — whether done directly or via sub-agents. When spawning sub-agents for coding tasks, include the relevant rules in the task prompt. Sub-agents don't inherit your context — if you don't pass the rules, they don't exist.

**Deciding what to build** (specs, design and architecture decisions, the development process) is covered by the `jeeves-design` skill. Its implementation stages (Stages 3–4) and its quality and release gates are carried out under this skill's standards.

---

## Core Coding Rules

Design-first principles (converge on the design before coding, services-first architecture, open-source first) are in `jeeves-design`.

1. **Schema-first** — Runtime schema (Zod) is source of truth; TypeScript types derived via `z.infer<>`; validation centralized. Plain TypeScript `interface` declarations for config surfaces are not acceptable.
2. **300 LOC hard limit** — If a file would exceed 300 lines, stop and decompose first. No exceptions.
3. **Avoid `any`** — Prefer `unknown` + narrowing; if unavoidable, narrowest scope + rationale.
4. **Test pairing** — Every non-trivial module gets a `*.test.ts`.

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

Run the repo's lint, typecheck, test, and build commands before each commit. All quality gates must pass before you commit.

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

_Earned: 2026-05-12, created the jeeves-tools repo with Zod 3 despite Zod 4 being available since mid-2025. Shipped 84 commits on the old major before catching it._

## Dependencies: Local Over Global

- **Dev dependencies belong in the project, not the global environment.** Install with `npm install --save-dev`, not `npm install -g`.
- This guarantees reproducibility across machines and CI. Global installs mask environment differences that cause "works on my machine" failures.
- **Rare exceptions:** Tools that are genuinely machine-level utilities. If in doubt, install locally.

## Dependency Failures

When a third-party dependency is broken:

1. Summarize the failure concisely.
2. Enumerate options: switch dependency → fix upstream → temporary pin → shim (last resort).
3. Recommend with rationale.
4. Do NOT immediately code around the problem.

## CHANGELOG

- **Do not manually update CHANGELOG.md** — it is generated as part of the release process (e.g. via `standard-version`, `changesets`, or equivalent). Conventional commit messages are the input; the tooling produces the output.

## Dev Workspace

- **Clone location:** the instance's dev repos directory (`core.devRepos` in `jeeves config`), as `{devRepos}/{org-or-userid}/{repo}`. On managed instances this is `/opt/dev` (see `jeeves-platform-managed`). Do not clone repos elsewhere.
- Fresh clones are preferred over copying existing checkouts — `npm install` from registry is faster than disk-copying `node_modules`.
- Dev directory is NOT indexed by jeeves-watcher. Dev work stays off the archive.

## GitHub Auth (HARD GATE)

- **ALL GitHub operations use the bot identity.** Use the existing `gh` CLI login; confirm it with `gh auth status`. The logged-in account is the instance's bot identity. This works the same on every platform.
- For tools that need a token in an environment variable (e.g. `GH_TOKEN`), obtain it from `gh auth token` inline at the point of use. Never print, echo, or log the token.
- Where the gateway service sets `GH_CONFIG_DIR` (as on managed Linux instances), `gh` finds its login there. That is not a separate auth method: always go through `gh`.
- Never write to GitHub as the owner's personal account.
- If the bot identity lacks permissions, **escalate to the operator** rather than falling back to a personal account.

## Pre-PR Checklist (HARD GATE)

**Before creating ANY PR, run the full verification sequence. No exceptions.**

1. Run all quality gates: `lint`, `typecheck`, `test`, `build`.
2. In monorepos: run checks **from each package directory**, not just the root. Root-level runs may mask package-level failures due to config resolution differences.
3. Exercise the release path: check `release-it` hooks (or equivalent) in each releasable package — run the same commands (`lint`, `typecheck`, `test`, `build`) from the same cwd the release process uses.

If any step fails, fix it before committing. Do NOT create the PR and "note" the failures. Do NOT claim pre-existing failures without having actually run the commands first. Skipping this sequence is how we ship broken code and fabricate diagnoses.

- **Compare against the canonical template** when the repo's owner maintains one for its package type (ask the operator which it is). If the project is behind the template, update it to conform. If the template is behind the project, raise it with the template's owner.
- **Run `ncu --peer`** (npm-check-updates, installed globally) before any PR. Review the output. Update safe patches/minors. **Flag major version bumps for discussion** — never auto-apply `ncu -u` without reading what changed. Peer dep conflicts must be resolved, not ignored.
- When spawning sub-agents, include `ncu --peer` in the quality gate commands: `ncu --peer && npm run lint && npm run typecheck && npm run build && npm test`. The sub-agent should report `ncu` output and only apply updates that don't involve major bumps or peer conflicts.
- **Resolve ALL script warnings.** It is NOT acceptable to release code with outstanding warnings. They exist for a reason — fix them.
- **Typecheck/lint rules apply to ALL authored code**, including tests (no test `ignores`, no rules turned `off` for tests) and configs at project root (`eslint.config.ts`, `rollup.config.ts`, `vitest.config.ts`, etc.). Only generated code (e.g. typedoc output) should be excepted from code quality checks.
- **Never disable lint/typecheck rules** without surfacing it for discussion first. Disabled rules are a major code smell. If a rule must be disabled, document the rationale inline at the point of suppression. The one standing exception is narrow and test-only: see the hard gate below.
- **Multiple tsconfigs are a code smell.** Sometimes needed, but often they paper over poor configuration choices. Fix root causes rather than adding tsconfig variants.
- **In a TS repo, all scripts should be authored in TS** (not JS). Prefer execution with `tsx`.
- **Clean-room verify before claiming "all green."** Run `rimraf node_modules && npm install && npm run build` (or equivalent) to catch issues masked by cached state. If someone reports an error you can't reproduce, assume your cache is lying — not that they're wrong.
- Verify build, test, and lint pass after updates.

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

Never disable lint/typecheck rules without surfacing it for discussion first. Fix the code, don't suppress the warning. For test mocks, use properly typed partial objects (`Partial<RealType>`, typed `MockReply` interfaces) instead of `any`. Tests are code: lint rules apply to them too, so no test `ignores` and no rules turned `off` for tests.

- **Production code:** `eslint-disable` is forbidden.
- **Tests:** a single line may carry `eslint-disable-next-line <rule> -- <why>` only when all three hold: the test genuinely can't be written another way, the reason is given inline after `--`, and each such line is listed in the PR description. Never a file-wide or block `eslint-disable`.

## Git Merge Policy

- **No squash merges.** Preserve commit history.
- **PR reviewer:** Request review from the repo's human owner (`gh pr create --reviewer <login>`); ask the operator if you don't know who that is.

---

When working in the scripts repo, also read the `jeeves-scripts` skill for repo-specific conventions.
