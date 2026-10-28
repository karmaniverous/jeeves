---
name: jeeves-pr-review
description: >
  Finish and review a pull request before any human review: SOLID/DRY, test adequacy with mutation checks, docs sync, gates, CI, then an independent review by a fresh subagent posted to GitHub, and an evidence-based PR description. Use before calling any PR ready or requesting review. Replaces Copilot review.
---

# Finishing and Reviewing a PR

A PR is not called ready, and no human review is requested, until every pass below has run on the pushed head and the independent review is posted and answered. This replaces Copilot review: don't request one.

The coding rules themselves are in `jeeves-coding`; what to build is in `jeeves-design`. This skill is the finishing procedure that proves a change meets them.

Keep a notes file from the start (passes done, SHAs, coverage figures, review id, thread outcomes). Long tasks lose older tool output; resume from the notes.

**Passes certify a SHA.** Any later commit (review fixes, gate fallout, a rebase, someone else's push) gets passes 1-3 again over `git diff <certified>..HEAD` before the PR is called ready.

## Finishing passes, in order

### 1. SOLID/DRY over the diff

Read every file in `git diff --name-only origin/main...HEAD`.

- One responsibility per module and function; no file over 300 lines.
- Logic that appears twice belongs in one place. Look across the whole diff, including logic duplicated between new and existing code.
- Changes here are behaviour-preserving refactors: the suite passes unchanged before and after.
- List any export added, renamed or removed, and check downstream consumers before removing one.

Done when the findings (or "none") are in the notes.

### 2. Test adequacy

- **Coverage per touched file**, read file by file rather than from the `All files` row. Aim for full branch coverage of changed logic; give a written reason for any uncovered branch. An uncovered fallback arm is often dead code: tighten the types instead of testing it.
- **No trivial tests.** Remove tests that restate the implementation (a constant equals itself, a mock returns what it was told to). Collapse copy-pasted cases into table-driven tests.
- **Mutation check on changed logic.** For each decision the change introduces, apply a small mutant (flip a condition, drop a branch, change a constant), run the relevant tests, restore the file. Every mutant must fail a test. A survivor is either a missing test (write it) or equivalent code (simplify it).
- Never lower an existing coverage threshold.

Done when coverage per touched file and mutants killed / total are in the notes.

### 3. Docs in sync

README, guides, skills and TSDoc describe what the code now does.

- Capture real behaviour (`--help`, the built `.d.ts`), not memory of it.
- Every example still runs or typechecks; links resolve.
- Remove documentation of anything removed.
- The changelog is generated: never edit it by hand.

Done when the docs changed (or "none needed", with why) are in the notes.

### 4. All gates

The repo's lint, typecheck, tests, build, and any dead-code, docs or audit scripts it has. Zero errors and zero warnings, tests included. No `eslint-disable` or type suppression (see `jeeves-coding`).

### 5. CI green on the pushed head

Push, then wait for every check on that SHA. "Tests passed" with a failed coverage threshold is red.

## Independent review

Run it after the finishing passes, on a pushed head.

1. **Brief a fresh reviewer.** Spawn a subagent with a clean context (never the authoring subagent, never a fork of its transcript). Give it: the repo, PR number, base and head SHAs, the governing spec section, the coding standards (`jeeves-coding`), and the severity scale **bug / should-fix / nit**. It stays read-only until the review is posted and states in the review that it didn't author the change.
2. **Review the whole diff** (`git diff origin/main...HEAD`) and the code it relies on, against the spec line by line. Each finding: severity, `path:line` at the head SHA, what is wrong and why. Also record what was checked and holds.
3. **Post one GitHub review** with event `COMMENT` (an author can't approve or request changes on their own PR), `commit_id` = the head SHA, inline comments on the RIGHT side, and a summary with counts per severity and a "what checked out" list. Use a dry-run-first script to post it.
4. **Fix or answer every finding.**
   - A fix is its own commit, with a test shown to fail with the fix stashed and pass with it (record both), plus a mutation check where logic changed.
   - A finding not fixed gets a technical reason.
5. **Reply to every thread** with the fixing SHA or the reason. Resolve fixed threads; leave declined threads open with the reason.
6. **Re-certify.** Run finishing passes 1-5 over the fixes. Commits after the review get a further independent review of `git diff <reviewed>..HEAD`.

## PR description

Write it from evidence, not intent:

1. A table mapping each scope item to where it lives and the test that fails without it.
2. Each finishing pass's result: SOLID/DRY findings, coverage per touched file, mutants killed / total, docs changed, gate results with test counts.
3. The independent review: link, findings fixed / answered.
4. Anything left for the owner to decide, and any test-only lint suppressions (each listed, as `jeeves-coding` requires).

Rewrite the description whenever the pushed state changes; a stale description is wrong.

## Done when

Every pass is reported against the current head SHA; the review is posted, every thread replied to and every fixed thread resolved; gates and CI are green on that head; the description matches it. Only then call the PR ready and request the owner's review. Merging and releasing stay with the owner.
