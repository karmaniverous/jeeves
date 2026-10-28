# Review Instructions

These are the standards every pull request in this repo is reviewed against, by any reviewer, human or AI. They match the `jeeves-pr-review` and `jeeves-coding` skills shipped in `skills/`. Rate each finding **bug**, **should-fix** or **nit**, give its `path:line`, say what is wrong and why, and say what checked out.

## Review Philosophy

Review the whole diff against the governing spec section (the PR description names it), line by line: does the code do what the spec says, all of it, and nothing it doesn't?

If you find an issue, also ask: **why did existing quality controls let this through?** The highest-value comment is not "fix this line" but "add a lint rule / CI check / test that catches this class of issue everywhere, forever." Point fixes are acceptable; prefer suggesting a systemic control.

## Critical - Always Flag These

### No Lint/Check Suppression

Never accept or suggest disabling linting or type-checking rules. This includes `eslint-disable` (in any form, in production code and tests alike), `@ts-ignore`, `@ts-expect-error`, `noqa`, `noinspection`, or any equivalent. The code must be fixed, not suppressed. If a rule fires, the code is wrong.

Lint rules cover tests: flag test `ignores` and rules turned `off` for tests. For test mocks, suggest properly typed partial objects (`Partial<RealType>`, typed mock interfaces) instead of `any` or suppression comments. Tests are production code.

### No Unsafe Types

Flag every use of `any`. Prefer `unknown` with narrowing, or the narrowest possible type. If a lint rule could catch it automatically, say which.

### Type Safety Violations

Flag implicit `any`, missing return types on exported functions, and unchecked type assertions (`as Foo` without validation). If the type-checking configuration could be tightened to prevent them, say so.

### Missing Error Handling

Flag unhandled promise rejections, missing try/catch around I/O, swallowed errors (empty catch blocks without a stated reason), and fire-and-forget async calls.

### Security

Flag hardcoded secrets, credentials in source, injection vectors (SQL, command, template, shell), unsanitized input, and `eval()` or equivalent.

### Spec Conformance

Flag behaviour the governing spec section requires but the diff doesn't implement, behaviour the diff adds that the spec doesn't cover, and public-surface changes (exports, options, CLI flags) the spec doesn't list.

## Important - Review Carefully

### SOLID and DRY

- One responsibility per module and function. Flag modules with several reasons to change, concrete dependencies where an abstraction would decouple, and interfaces that force implementers to depend on what they don't use.
- Logic that appears twice belongs in one place, including logic duplicated between new and existing code.

### File Size

Flag any file over 300 lines. It should be decomposed into smaller, single-responsibility modules.

### Test Adequacy

- Every new module has a test file. Tests cover decision branches, edge cases and error paths, not only the happy path.
- **Would a test fail if the logic were wrong?** For each decision the change adds, ask whether flipping a condition, dropping a branch or changing a constant would fail a test. If not, the tests are inadequate; the PR description should report a mutation check.
- **No trivial tests**: tests that restate the implementation (a constant equals itself, a mock returns what it was told to).
- Suggest table-driven tests over copy-pasted cases.
- Flag lowered coverage thresholds.

### Docs in Sync

Flag README, guide, skill or TSDoc text that no longer matches the code, examples that wouldn't run, and documentation left behind for removed features. Every exported symbol has TSDoc.

### Schema-First Config

Flag configuration or validation surfaces defined with bare type declarations instead of runtime schemas. Zod 4 is required; types are derived with `z.infer<>`. Flag Zod 3 patterns or a `zod@^3` dependency.

### CHANGELOG and Lock File

Flag manual CHANGELOG edits (it is generated from conventional commits). If `package.json` changes without the lock file, flag it.

### PR Description

The description should map each scope item to the test that fails without it, and report each finishing pass: SOLID/DRY findings, coverage per touched file, mutants killed, docs changed, gate results. Flag a description that claims what the diff doesn't show.

## Suggestions - Code Quality

- **Services-first.** Core logic belongs in service modules behind clean interfaces; adapters stay thin; side effects at the boundaries.
- **Open-source first.** Before accepting a custom implementation, consider whether an established package already solves it.
- The formatter is the source of truth for formatting: don't suggest formatting changes; suggest formatter configuration instead.
- If a recurring issue could be caught by a lint rule or tooling configuration, suggest the rule.
- Flag PR titles that don't follow conventional commit format (`feat:`, `fix:`, `chore:`, `docs:`, ...).
