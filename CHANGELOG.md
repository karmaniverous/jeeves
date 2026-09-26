# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 💼 Other

- [108] feat!: createPluginToolset options argument is required
## [0.6.0-4] - 2026-09-26

### 💼 Other

- [108] fix: createPluginToolset calls the plugin's apiUrl, defaultPort only as fallback

createPluginToolset(descriptor, { apiUrl }) accepts a string or a per-call
resolver; unset falls back to http://127.0.0.1:<defaultPort>.
- [108] chore: release v0.6.0-4
## [0.6.0-3] - 2026-09-26

### 💼 Other

- [108] fix: write each plugin's config before its install, then sweep
- [108] chore: release v0.6.0-3
## [0.6.0-2] - 2026-09-26

### 💼 Other

- [108] fix: sweep pending plugin migrations before config writes and before each retry
- [108] chore: release v0.6.0-2
## [0.6.0-1] - 2026-09-26

### 💼 Other

- [108] fix: retry config writes while freshly installed plugins converge
- [108] chore: release v0.6.0-1
## [0.6.0-0] - 2026-09-26

### 💼 Other

- [108] feat!: static-only platform content; retire installer CLI and ComponentWriter (#108)

Remove every live-workspace writer and the plugin installer from core, and
export the static platform content as pure data for jeeves-tools to render.

- Remove ComponentWriter/createComponentWriter (timer cycle, TOOLS.md
  sections, refreshPlatformContent, cleanup escalation, HEARTBEAT
  orchestration, component-versions, registry checks) (D1)
- Remove createPluginCli and patchConfig/openclaw config helpers,
  extension copy, npm install, plugins.installs writes, --memory slot
  claim, HEARTBEAT/skill seeding (D2, D3)
- Add PLATFORM_SECTIONS/SKILLS/TEMPLATES, renderPlatformContent,
  upsertPlatformSection, pure managed-block transforms, and
  test-enforced per-section and total character budgets
- Add registerPromptContext (before_prompt_build -> appendSystemContext,
  never systemPrompt) and onPluginDispose (D5)
- Replace proper-lockfile (signal-exit process handlers at import time)
  with an mkdir-based withFileLock; add import-hygiene test
- Rework jeeves install/uninstall/status for static content
- Drop TOOLS-writer descriptor fields; fold tools-platform guidance into
  the AGENTS block and jeeves skill
- Docs: README, guides, migration guide, diagrams

BREAKING CHANGE: createComponentWriter, createPluginCli, patchConfig,
refreshPlatformContent, seedSkills, HEARTBEAT and component-version APIs,
updateManagedSection/removeManagedSection, SECTION_IDS and related exports
are removed; TOOLS_MARKERS is now LEGACY_TOOLS_MARKERS; parseManaged
requires markers and no longer returns sections. See
guides/migrating-to-v1.md.
- [108] chore: delete stale root TOOLS.md snapshot
- [108] refactor!: make static platform content internal to the jeeves CLI

`jeeves install` is the sole writer of static platform content (owner
decision A). The render/upsert functions, the content data and the
budget constants move from the library into src/cli/jeeves/content and
are bundled only into the CLI. Budget and hygiene tests move with them.

validateSkillFrontmatter stays public (now under the plugin SDK) so
plugins can keep their SKILL.md build check (D4).

BREAKING CHANGE: renderPlatformContent, upsertPlatformSection,
PLATFORM_SECTIONS, PLATFORM_SKILLS, PLATFORM_TEMPLATES,
BOOTSTRAP_FILE_MAX_CHARS, PLATFORM_SECTION_BUDGETS,
PLATFORM_CONTENT_TOTAL_BUDGET and their types are no longer exported.
Run `jeeves install` instead.
- [108] refactor!: remove createAsyncContentCache

Spec v1 §2.1 lists createAsyncContentCache under "not in jeeves-core"
(owner decision B). registerPromptContext already accepts async
providers, so plugins can await their own data.

BREAKING CHANGE: createAsyncContentCache and AsyncContentCacheOptions
are no longer exported.
- [108] feat(cli): install and update Jeeves plugins through the OpenClaw CLI

Owner decision C / spec §4.8: the jeeves CLI is the local control
surface. It now installs, updates and removes the Jeeves component
plugins by driving the openclaw CLI as child processes:

- jeeves install [plugins...]  renders content, then for each plugin
  (default: runner, watcher, server, meta @latest) resolves an exact
  version with npm view and runs
  openclaw plugins install npm:<pkg>@<ver> --pin --accept-capabilities --force
- jeeves update [packages...]  same plugin path, no content; defaults to
  every Jeeves plugin with a plugins.entries record, at latest
- jeeves uninstall --plugins [specs...]  openclaw plugins uninstall
  <id> --force, then unsets entries.<id> left as {enabled:false} and
  restores plugins.load if it was deleted (spike S1 quirk)

After install: legacy ~/.openclaw/extensions/<id> copies are removed
(only when their package.json names the expected package), and
plugins.entries.<id>.hooks.allowConversationAccess=true is set with one
openclaw config set --batch-json call (leaf path, so entry config is
preserved; spike S2). plugins.installs is never written (guarded).

All mutating commands take --dry-run, which prints the exact openclaw
commands and config changes and runs only read-only queries. Any
non-zero exit fails the command loudly. Processes are spawned with
cross-spawn (no shell strings), so the same code runs on Windows and
Linux. All logic sits behind CommandRunner/LegacyFs ports with unit
tests for command construction, config patches, legacy cleanup, dry-run
output and failure propagation.
- [108] docs: jeeves CLI owns content and plugin install

README, migration guide and guides now describe the owner decisions:
jeeves install is the only writer of static content (not exported),
createAsyncContentCache is gone, and jeeves install/update/uninstall
--plugins drive the OpenClaw CLI with --dry-run. Adds the open-source
install flow and how jeeves-tools will call the CLI over SSH. The
managed-content lifecycle diagram source is updated; the PNG is not
regenerated (no plantuml on this host).
- [108] feat(cli): write plugin config in jeeves install

Adds --config-root (shared), --runner/watcher/server/meta-api-url, --server-plugin-key and --plugin-config <file.json>. Precedence: option > file > existing > default > error. Existing values are kept unless passed. Missing required config fails before any write. Server pluginKey defaults to the server's keys._plugin, else a generated 256-bit seed. Secrets are redacted from dry-run, logs and errors. Config ops share the hook-access batch.
- [108] docs: plugin config options and new-box flow
- [108] feat(cli): batch-file config writes, idempotent installs, declared hook grants, update fills config, uninstall removes plugins

- config set --batch-file with an owner-only temp file (0600 in a 0700 mkdtemp dir; icacls on Windows), deleted in finally; no values on any command line

- skip plugins install when openclaw plugins inspect --all --json records the exact npm version; --force-reinstall overrides; config and hook grants still applied

- grant hooks.allowConversationAccess only to packages declaring jeeves.conversationHooks (npm view); never removed

- jeeves update takes the install plugin options and fills in missing config with the same precedence

- jeeves uninstall always removes the Jeeves plugins; --plugins dropped; skipped when OpenClaw is absent
- [108] docs: batch-file writes, idempotent installs, declared conversation hooks, update config, uninstall removes plugins
- [108] feat(cli): keep the server pluginKey and jeeves-server keys._plugin in step

jeeves install/update decide the server plugin key for both ends: take the server's keys._plugin, copy the plugin's key into a server config without one, generate one for both ends, fail before any change on a conflict unless --server-plugin-key is passed. A missing server config or non-literal keys._plugin is never written (plugin side only, with a warning; fails if a key would be generated). Server config writes are planned first, locked, re-checked, backed up (config.json.bak-<timestamp>) and atomic with the file mode kept; only keys._plugin changes. atomicWrite gains an optional mode. No new dependency.
- [108] feat(plugin): validateConversationHooks build check for declared conversation hooks

recordRegisteredHooks runs a plugin's register(api) with a recording api.on; validateConversationHooks throws unless package.json jeeves.conversationHooks lists exactly the gated hooks the plugin registers (Q15). CONVERSATION_HOOK_NAMES moves to the plugin SDK and is shared with the CLI.
- [108] docs: server plugin key sync and the conversation hook build check
- [108] feat(cli): edit keys._plugin in place with jsonc-parser

Owner-approved runtime dependency jsonc-parser, pinned to the latest release 3.3.1. The server config write is now a minimal text edit (modify + applyEdits) using the file's own indentation and line endings, so the rest of the file stays byte for byte; the result must still pass JSON.parse (jeeves-server's loader) before it is written.
- [108] Revert "[108] feat(cli): edit keys._plugin in place with jsonc-parser"

This reverts commit 8e1c92c6d5f4c14770861db50e3bb0ad6889749d.
- [108] chore(deps): update all dependencies (peer-constrained)

npm-check-updates --peer -u; npm audit fix (lockfile only). TypeScript 7 held: typedoc and typescript-eslint peer ranges stop at 6.0.x. release-it 21 parses CLI flags strictly: release:pre now uses the documented --github.preRelease (the old --github.prerelease spelling was silently ignored by v20 and is rejected by v21). knip 6.38 reports OS binaries: nssm joins plantuml in ignoreBinaries.
- [108] fix(api): narrow jsonpath-plus 11 unknown result in config query

jsonpath-plus 11 types JSONPath() as unknown. Request wrap explicitly and narrow with Array.isArray instead of annotating the result as unknown[].
- [108] style: apply prettier 3.9 union formatting
- [108] chore(deps): approve lefthook install script in allowScripts
- [108] refactor: share isRecord, getErrorCode, getErrorMessage and exit formatting

One definition each for plain-object checks (was 2 local copies + 4 inline variants), Node error codes (fileLock/fileOps), unknown-error messages and '<command> exited <n>' warnings.
- [108] refactor: drive per-plugin config, CLI options and id mapping from one descriptor table

PLUGIN_CONFIG_FIELDS is now keyed by PlatformComponent and carries each option's help; addPluginOptions and pluginConfigFromOptions iterate PLUGIN_OPTION_FIELDS instead of hard-coding runner/watcher/server/meta. pluginIdOf/packageNameOf are the single id<->package mapping (componentOf no longer has its own regex; the package-name regex reuses the id pattern). Help output is byte-identical. Tests pin the option order and the table/schema agreement.
- [108] refactor: separate plan building, step description and command-line formatting

describeStep.ts owns dry-run/live descriptions (plan.ts now only builds steps); executePlan logs batch writes through describeConfigBatchLines instead of re-deriving them, and runs exec steps and repair unsets through one runLogged. commandLine.ts holds the pure quoteArg/formatCommand/describeExit (commandRunner.ts is now just the process port). CONFIG_SET_BATCH_FILE and restoreLoadOp replace duplicated literals; parseJson replaces two try/JSON.parse/rethrow blocks (messages unchanged).
- [108] refactor: share CLI run output, install options and service probing across commands

cliOutput.ts holds the dry-run marker, run header, closing line, plugin notices and restart reminder (RESTART_NOTICE moved out of pluginDeps, which is wiring). installOptionsFromCli builds the config request + reinstall policy once for install and update. serviceProbe.ts is the single /status probe used by status and uninstall. uninstall's artifact removal moved into uninstallHelpers.removePlatformArtifacts (counterpart of installPlatformContent). Output and help text unchanged.
- [108] refactor: tidy module names, internal exports and stale docs

Rename plugins/testRunner.ts -> fakePorts.ts (it holds the runner and temp-file fakes, not a test runner) and constants/sections.ts -> components.ts (it holds PLATFORM_COMPONENTS). Drop the export keyword from eight symbols only used inside their module (none is re-exported from the package). promptContext no longer says jeeves-tools must render allowConversationAccess: jeeves install/update grant it. Add @module to the touched modules that lacked it.
- [108] refactor: dedupe test fixtures (temp dirs, console capture, command deps, plugin ids)

src/test/tempDir.ts (useTempDir) replaces nine hand-rolled tmpdir/random-suffix/rm blocks; src/test/cliHarness.ts captures console output and unsets JEEVES_CONFIG_ROOT per test. workflowTestKit gains commandWorkflowDeps (the three command tests no longer each re-implement PluginWorkflowDeps), npmRecord and M, and is the single source of the W/R/S/M plugin ids. executePlan.test builds contexts with one setup(); it now also pins the live '$ ' log lines of exec and batch steps. No assertion weakened.
- [108] test: cover plugin workflow gaps (runner errors, inspect specs, key sync, file-sourced pluginKey, server-write failure, deps wiring)
- [108] test: cover file lock races, managed block removal, frontmatter blocks, config query edge cases
- [108] test: cover install/uninstall/status command paths (content-only, default targets, responding services, memory hygiene)
- [108] test: remove duplicate and constant-only tests, make descriptor hook tests able to fail
- [108] docs: sync README, guides, skill, diagram sources and TSDoc with #109 code
- [108] docs: regenerate diagram PNGs from updated PlantUML sources
- [108] feat!: jeeves install no longer writes platform skills

Removes PLATFORM_SKILLS, content/skills/*.md and their rendering/writing. jeeves install writes nothing under skills/ and never deletes existing skill folders; uninstall still leaves skills/ alone. Skills move back into core from jeeves-tools later (karmaniverous/jeeves-tools#137).
- [108] feat!: drop registryCache from the core config schema

Nothing reads it since checkRegistryVersion was removed. New core config.json no longer contains it; existing files that still carry it keep validating (zod strips unknown keys), covered by tests.
- [108] docs: core ships no skills; registryCache removed

README, guides (migration table and existing-instance notes, managed-content, platform overview, plugin guide) and diagram sources: jeeves install writes no skills, install/uninstall leave skills/ alone, registryCache dropped from core config.
- [108] docs: regenerate diagram PNGs without the skills output
- [108] feat!: drop the spec templates from core

Owner decision 2026-09-26 01:45Z: spec.md and spec-to-code-guide.md move to jeeves-tools (jeeves-coding skill). Removes content/templates, PLATFORM_TEMPLATES, RenderedPlatformContent.templates, the install writes and the 'N reference templates' line, uninstall's templates/ removal, and the now-unused TEMPLATES_DIR constant. Install and uninstall never touch jeeves-core/templates/.
- [108] docs: core ships no spec templates
- [108] docs: regenerate managed-content-lifecycle diagram without templates
- [108] feat!: drop the unused SKILLS_DIR export

Owner decision 2026-09-26 01:55Z. Nothing in core or any downstream repo imports it (watcher/meta build scripts define their own). Listed in the migration guide's removed table.
- [108] docs: spec templates ship with the jeeves-design skill
- [108] fix: serialise stale lock takeover so a freshly re-taken lock is never deleted

withFileLock removed a stale {file}.lock unconditionally after stat; another process could take the lock in between and lose it. Takeovers now go through a {file}.lock.takeover guard and re-check the age before removing. Document that the lock is not refreshed while held (no timers), so fn must be a short read-modify-write. Addresses Copilot review on #109.
- [108] fix: redact JSON-escaped secrets in batch file output

redactSecrets matched only the raw secret, so a pluginKey containing quotes, backslashes or control characters leaked through the JSON-serialized batch file content in dry-run and live logs. Redact the JSON-escaped form too. Addresses Copilot review on #109.
- [108] chore(deps): approve install scripts by package name
- [108] chore: release v0.6.0-0
## [0.5.12] - 2026-06-11

### 💼 Other

- [V0-5] fix(plugin): run npm install in extension directory (#103)

The plugin installer copies dist/, package.json, and openclaw.plugin.json
but never ran npm install, leaving extensions without node_modules.
Added execSync npm install --omit=dev after file copy step.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-5] fix(api): accept explicit configPath in createConfigApplyHandler (#104)

Components using custom --config paths couldn't use config apply because
the handler derived a path that didn't exist. Added optional configPath
parameter that takes precedence over registered and derived paths.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

### ⚙️ Miscellaneous Tasks

- Add copilot review instructions
- Release v0.5.12
## [0.5.11] - 2026-05-29

### 💼 Other

- [V0-5] fix: reject Windows drive-letter paths on non-Windows platforms (closes #100)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-5] feat: hoist substituteEnvVars to core (closes #90)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-5] feat: hoist Slack file download fallback to platform content (closes #93)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-5] chore: update dependencies
- [V0-5] fix: validate drive-letter paths before resolve() in initFromOptions (closes #100)
- [V0-5] test: add substituteEnvVars immutability test
- [V0-5] chore: update lefthook, fix lint from typescript-eslint 8.60
- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Migrate changelog to git-cliff (closes #95)
- Release v0.5.11
## [0.5.10] - 2026-05-13

### 🚀 Features

- Bundle generic platform skills in seedContent (#94)

### ⚙️ Miscellaneous Tasks

- Add npm publish safety net (.npmignore + gitignore *.local)
- Add npm-pack-check CI workflow
- Move changelog generation to after:bump hook
- Update major deps (eslint-plugin-simple-import-sort 13, release-it 20, typescript 6)
- Release v0.5.10
## [0.5.9] - 2026-05-03

### 💼 Other

- [059] [85,86,87,76,79,72] feat: ComponentWriter lifecycle fix, staleness removal, Handlebars migration, content updates, docs

- Fix ComponentWriter reschedule race by adding explicit `stopped` flag (#85)
- Remove flawed memory staleness heuristics (staleDays, extractMostRecentDate) (#86)
- Migrate content templating from bespoke comment-conditionals to Handlebars (#87)
- Add handlebars runtime dependency for template rendering
- Tighten Slack threading rule to prohibit bot-initiated threads (#87)
- Add Post-Upgrade Maintenance guidance to Platform section (#76)
- Add Source Code Preference with devRepos config mapping (#79)
- Add devRepos to workspace core config schema and JSON Schema
- Update platform-overview.md with HEARTBEAT flows and dual-layer locking (#72)
- Remove staleness references from documentation and README

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [059] chore: bump version to 0.5.9, update deps, fix lint warnings from updated eslint rules

- Bump version to 0.5.9
- Update safe minor/patch dependencies
- Remove unnecessary type assertions flagged by updated typescript-eslint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [059] fix: revert version bump (release is owner-controlled)
- [059] refactor: hoist workspace config load to ComponentWriter cycle (DRY)
- [059] test: add restart lifecycle and devRepos schema coverage
- [059] fix: race condition in start() during finishing cycle, remove redundant nullish coalescing
- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Release v0.5.9
## [0.5.8] - 2026-04-22

### 💼 Other

- [83] fix: resolve config apply path from registered override (#83) and downgrade transient fetch errors to concise warnings (#77)

Add registerComponentConfigPath/getComponentConfigPath to init state so
components can register their actual --config path after startup.
configApplyHandler now reads from the registered path when available,
falling back to the derived configRoot path.

Add isTransientError classifier (ECONNRESET, ETIMEDOUT, AbortError, etc.)
and use it in createAsyncContentCache default error handler to emit
single-line warnings for recoverable network failures while preserving
full stack traces for unexpected errors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [83] fix: traverse full error cause chain for transient classification

### ⚙️ Miscellaneous Tasks

- Release v0.5.8
## [0.5.7] - 2026-04-15

### 🚀 Features

- Condense managed content and rewrite HEARTBEAT alerts

### 🐛 Bug Fixes

- Use dynamic budget in HEARTBEAT alert text

### ⚙️ Miscellaneous Tasks

- Release v0.5.7
## [0.5.6] - 2026-04-08

### 🐛 Bug Fixes

- Serialize managed content writer cycle
- Preserve file lock safety for managed writes
- Prevent component writer cycle reentry

### 💼 Other

- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Release v0.5.6
## [0.5.5] - 2026-04-05

### 💼 Other

- [73] fix: preserve dist/ subdirectory in plugin install layout

copyDistFiles was copying dist contents flat into the extension root,
but package.json (main: dist/index.js) and openclaw.plugin.json
(skills: ["dist/skills/..."]) both expect a dist/ subdirectory.

Change copyDistFiles target from extensionsDir to
join(extensionsDir, 'dist') so the installed layout matches
the manifest paths.

Closes #73

### ⚙️ Miscellaneous Tasks

- Release v0.5.5
## [0.5.4] - 2026-04-05

### 💼 Other

- [73] fix: replace distDir param with importMetaUrl in createPluginCli

createPluginCli now derives the package root internally via
packageDirectorySync and appends /dist, instead of trusting
callers to compute distDir. This fixes:

1. Server plugin skill path mismatch (distDir pointed to dist/,
   flattening the copy and breaking the skill path declared in
   openclaw.plugin.json)
2. Three plugins overcopying the entire package root into
   extensions (README, LICENSE, content/, etc.)

Also extracts getPackageRoot() as a new exported helper and
refactors getPackageVersion() to use it.

BREAKING CHANGE: CreatePluginCliOptions.distDir replaced by
importMetaUrl. All plugin consumers must update their cli.ts.

Closes #73
- [73] fix: validate dist directory exists before copying

Add explicit existence check for distDir before calling copyDistFiles.
Provides a clear error message if the plugin hasn't been built,
instead of a cryptic ENOENT from readdirSync.

Addresses review feedback from gemini-code-assist.
- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Release v0.5.4
## [0.5.3] - 2026-04-05

### 💼 Other

- [0-5] feat: v0.5.2 patch release

- #66: atomicWrite EPERM retry + ComponentWriter startup jitter
- #67: remove hourglass instruction from managed AGENTS section
- #68: plugin installer provenance records (plugins.installs)
- #69: workspace file size monitoring in HEARTBEAT cycle
- #70: remove OpenClaw default duplication from managed sections
- [0-5] fix: complete v0.5.2 spec implementation

- document workspace file size monitoring in skill content
- respect declined HEARTBEAT headings for workspace file alerts
- add unit tests for workspace file health checks
- [0-5] refactor: SOLID/DRY pass across codebase

DRY: extract getErrorMessage() utility — replaced 13 duplicate
     `err instanceof Error ? err.message : String(err)` patterns
DRY: extract escapeForRegex() — replaced 3 duplicate regex escape patterns
SRP: extract handleCommandError() in createServiceCli — replaced 5 duplicate
     error-handling blocks in service management commands
- [0-5] test: add missing test coverage for utils and workspace health

- add utils.test.ts: getErrorMessage with Error, subclass, string, number, null, undefined, object
- validates no trivial tests exist in touched code
- [0-5] docs: sync docs with v0.5.2 implementation

- README.md: fix staleDays default (90 → 30, matches WORKSPACE_CONFIG_DEFAULTS)
- README.md: fix resolveConfigValue signature (positional params, not options object)
- README.md: add installRecord param and plugins.installs to patchConfig description
- README.md: clarify loadWorkspaceConfig return behaviour (no warning on missing file)
- content/skill.md: correct workspace file monitoring threshold — not configurable
  via jeeves.config.json (heartbeatCycle calls checkWorkspaceFileHealth without
  passing wsConfig values, so the 80% threshold is a fixed default)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
- [0-5] fix: address Gemini review feedback on PR #71

- fix: parseHeartbeat regex now recognizes workspace file headings
  (AGENTS.md, SOUL.md, etc.) so users can decline alerts
- fix: atomicWrite temp filenames include target basename + UUID
  to prevent collision in concurrent writes
- fix: CRLF-safe orphaned marker cleanup regex in updateManagedSection
- refactor: patchConfig uses function overloads to enforce installRecord
  on 'add' mode at the type level
- test: add heartbeat parser test for workspace file heading recognition

### ⚙️ Miscellaneous Tasks

- Release v0.5.3
## [0.5.1] - 2026-04-03

### 🚀 Features

- Integrate memory hygiene into HEARTBEAT cycle (Phase 9)

### 🐛 Bug Fixes

- Add .js extension to test import (Gemini review)

### 💼 Other

- Fix

### 📚 Documentation

- Update skill with HEARTBEAT memory integration

### ⚙️ Miscellaneous Tasks

- Release v0.5.1
## [0.5.0] - 2026-04-02

### 🚀 Features

- Node 22 runtime floor
- Keep managed blocks stationary and move cleanup warning inside block
- Escalate cleanup via gateway session spawn
- Shared workspace config loader and jeeves config command
- Memory hygiene + deployed jeeves skill (Phase 7)

### 🐛 Bug Fixes

- Address Gemini review — cross-contamination and orphaned markers
- Address Gemini review — remove redundant check, deduplicate escalation
- Address Gemini review — env guard, absolute paths, warn on bad config, dynamic output
- Address Gemini review — zero-budget guard, remove redundant replace

### 🚜 Refactor

- Use semver.major() for Node version check
- Extract heartbeat cycle and cleanup scan from ComponentWriter

### 📚 Documentation

- Sync README and guides with v0.5.0 features

### ⚙️ Miscellaneous Tasks

- Remove Phase 5 files accidentally included in Phase 4 PR
- Release v0.5.0
## [0.4.7] - 2026-04-02

### 🚀 Features

- Plugin installer fix + utility hoist + getPackageVersion (#57)

### 🧪 Testing

- Fill test gaps for Phase 1 validation

### ⚙️ Miscellaneous Tasks

- Release v0.4.7
## [0.4.6] - 2026-03-31

### 💼 Other

- [53] fix: call init() before descriptor.run() in start command

### ⚙️ Miscellaneous Tasks

- Release v0.4.6
## [0.4.5] - 2026-03-30

### 💼 Other

- [51] fix: replace spawn recursion with descriptor.run in start command
- [51] chore: remove temp scripts
- [51] chore: remove remaining temp scripts

### ⚙️ Miscellaneous Tasks

- Release v0.4.5
## [0.4.4] - 2026-03-30

### 🐛 Bug Fixes

- Clean up temp files on failed atomic write + guard invalid semver in tests

### ⚙️ Miscellaneous Tasks

- Update dependencies
- Release v0.4.4
## [0.4.3] - 2026-03-29

### 🐛 Bug Fixes

- Config CLI tree and config apply wire format

### ⚙️ Miscellaneous Tasks

- Release v0.4.3
## [0.4.2] - 2026-03-29

### 🚀 Features

- Add customMerge hook to createConfigApplyHandler

### 🐛 Bug Fixes

- Defensive nullish coalescing in customMerge test mock

### ⚙️ Miscellaneous Tasks

- Release v0.4.2
## [0.4.1] - 2026-03-29

### 🚀 Features

- Phase 1 - descriptor schema, status handler, plugin CLI
- Phase 2 - service manager, config apply handler, writer migration
- Phase 3 - service CLI factory, plugin toolset factory
- Phase 4 - unified CLI with dynamic subcommand discovery

### 🐛 Bug Fixes

- Increase timeout for discoverComponents tests
- Address Gemini review comments

### 🚜 Refactor

- Remove dead JeevesComponent types and extract shared test helper

### 🧪 Testing

- Add CLI integration tests for createServiceCli

### ⚙️ Miscellaneous Tasks

- Remove temp commit script
- Release v0.4.1
## [0.4.0] - 2026-03-29

### 🚀 Features

- V0.4.0 infrastructure (C2-C6, C8)
- C3 getBindAddress + C7 getServiceState
- C9 heading-based HEARTBEAT section writer
- C10 HEARTBEAT health orchestration
- C11 CLI writes initial HEARTBEAT + C12 AGENTS content update
- Proactive session-start bootstrap via AGENTS directive
- Proactive update alerts in HEARTBEAT

### 🐛 Bug Fixes

- Resolve commander ESM import failure in published CLI build (#41) ([#41](https://github.com/karmaniverous/jeeves/pull/41))
- Export all new v0.4.0 public API from src/index.ts
- Address Gemini review comments

### 💼 Other

- Npm audit fix

### 🚜 Refactor

- SOLID/DRY cleanup

### 🧪 Testing

- Orchestrator unit tests (10 cases)
- Fill coverage gaps

### ⚙️ Miscellaneous Tasks

- Pass all quality gates (lint, knip, typecheck)
- Release v0.4.0
## [0.3.1] - 2026-03-25

### 🐛 Bug Fixes

- Remove double shebang from CLI entry point

### 💼 Other

- Strengthen managed section content for 0.3.1

### 🚜 Refactor

- Move ALL_MARKERS to constants/markers.ts as single source of truth

### 📚 Documentation

- Add TSDoc to inline type properties in PluginApi and ToolResult

### ⚙️ Miscellaneous Tasks

- Release v0.3.1
## [0.3.0] - 2026-03-22

### 💼 Other

- [V0-3] feat: implement v0.3.0 dev plan — remove probing, SDK cleanup, content updates

- Fix DEFAULT_CORE_VERSION to use CORE_VERSION from constants (#32)
- Remove probing from writer cycle: delete probe.ts, buildServiceRows.ts (#34)
- Remove health table and unhealthy services block from tools-platform.md
- Replace Handlebars with simple string replacement, uninstall handlebars
- Remove probeTimeoutMs from ComponentWriter, createComponentWriter, seedContent
- Remove serviceVersion from ComponentVersionEntry and WriteComponentVersionOptions
- Rewrite status command to use readComponentVersions + direct fetch
- Remove PluginApiLike type alias (v0.3.0 removal)
- Add resolveOptionalPluginSetting to plugin/resolve.ts with tests
- Add "Do Not Execute Untested Code" hard gate to soul-section.md
- Strengthen "Check PR State Before Pushing" rule in agents-section.md
- Add Spec Hygiene rules to spec.md template
- Clean up all barrel file exports for deleted items

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-3] fix: remove dead code, replace Handlebars markers with HTML comments
- [V0-3] chore: remove temp script
- [V0-3] refactor: SOLID/DRY cleanup — extract fetchWithTimeout, remove deprecated re-export

- Extract duplicated fetch+AbortController+timeout pattern from statusCommand.ts
  and uninstallCommand.ts into shared fetchWithTimeout() in plugin/http.ts
- Remove deprecated component/resolveWorkspacePath.ts re-export (scheduled for v0.3.0)
- Move resolveWorkspacePath export to plugin barrel in src/index.ts (canonical location)
- Fix skipped comment numbering (3-6) in refreshPlatformContent.ts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-3] test: close coverage gaps — fetchWithTimeout, statusCommand, template branches

Add direct tests for fetchWithTimeout (timeout/abort, signal pass-through,
cleanup). Add full statusCommand.test.ts covering healthy, HTTP error, down,
no-components, non-JSON body, and mixed-health exit-code paths. Add
renderPlatformTemplate IF/ELSE branch assertions to refreshPlatformContent
tests. Fix registry test timeout.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [V0-3] test: remove trivial tests — type-assignability checks, tautological assertions

- Delete src/plugin/types.test.ts (all 3 tests were pure type-assignability checks)
- Remove trivial `expect(writer).toBeDefined()` from createComponentWriter test
- Remove redundant `typeof === 'string'` assertion duplicating TS type narrowing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

### ⚙️ Miscellaneous Tasks

- Release v0.3.0
## [0.2.0] - 2026-03-20

### 💼 Other

- [V0-2] feat: Phase 1 — Plugin SDK types and utilities

- plugin/types.ts: PluginApi, ToolResult, PluginApiLike (compat alias)
- plugin/results.ts: ok, fail, connectionFail helpers
- plugin/http.ts: fetchJson, postJson helpers
- plugin/resolve.ts: resolveWorkspacePath, resolvePluginSetting
- plugin/openclawConfig.ts: resolveOpenClawHome, resolveConfigPath, patchConfig
- Updated component/resolveWorkspacePath.ts to use PluginApi
- All modules tested with co-located test files
- [V0-2] feat: Phase 2 — Managed content removal, semver fix, component versions

- managed/removeManagedSection.ts: remove sections or entire managed blocks
- Fix semver comparison: use semver.gt() for update arrows
- component/componentVersions.ts: shared version state file
- ComponentWriter writes version entries each cycle
- All modules tested with co-located test files
- [V0-2] feat: Phase 3 — Config query handler with JSONPath support

- api/configQuery.ts: createConfigQueryHandler with JSONPath filtering
- Added jsonpath-plus dependency
- All modules tested with co-located test files
- Updated index.ts exports for all new modules
- [V0-2] fix: patch tools.alsoAllow, read component versions in platform refresh, consolidate resolveWorkspacePath

Fix 1: patchConfig now patches tools.alsoAllow instead of tools.allow.
Removed plugins.allow patching (not in OpenClaw spec). patchAllowList
creates the array when it doesn't exist on add mode.

Fix 2+3: refreshPlatformContent now writes the calling component's
version entry (with serviceVersion from probe) to the shared state
file, then reads ALL component versions to populate every service row.
Removed separate writeComponentVersion call from ComponentWriter.

Fix 4: component/resolveWorkspacePath.ts now re-exports from
plugin/resolve.ts instead of duplicating the implementation.
Test simplified to verify re-export identity.
- [V0-2] refactor: extract shared fileOps (atomicWrite, withFileLock, constants) from managed section files

DRY fixes:
- Extract STALE_LOCK_MS, DEFAULT_CORE_VERSION constants to shared fileOps.ts
- Extract atomicWrite (temp file + rename) pattern to shared utility
- Extract withFileLock (lock acquire + try/finally release) pattern
- Refactor updateManagedSection and removeManagedSection to use shared utilities
- Refactor componentVersions.writeComponentVersion to use atomicWrite
- [V0-2] refactor: extract buildServiceRows from refreshPlatformContent

SRP/DRY fixes:
- Extract ServiceRow type and buildServiceRows() to dedicated module
- Extract newerVersion() helper to eliminate duplicated semver check pattern
- Extract checkCoreUpdate() helper from inline logic
- Reduce refreshPlatformContent.ts from 305 to 255 lines (under 300 LOC limit)
- [V0-2] refactor: extract ManagedMarkers interface from inline types
- [V0-2] test: add 400 error path test for invalid JSONPath in configQuery
- [V0-2] docs: update README and guides for v0.2.0 Plugin SDK
- [V0-2] chore: remove stray _push.cjs helper script
- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Release v0.2.0
## [0.1.6] - 2026-03-18

### 🐛 Bug Fixes

- Inline CORE_VERSION at build time, add H1 titles to SOUL/AGENTS, merge Service Health into Platform table

### ⚙️ Miscellaneous Tasks

- Release v0.1.6
## [0.1.5] - 2026-03-18

### 🐛 Bug Fixes

- Check config workspace before resolvePath (resolvePath returns cwd, not workspace)

### ⚙️ Miscellaneous Tasks

- Release v0.1.5
## [0.1.4] - 2026-03-18

### 🐛 Bug Fixes

- Add resolveWorkspacePath to core (fixes writer writing to system32 when gateway cwd is C:\Windows\system32)

### ⚙️ Miscellaneous Tasks

- Release v0.1.4
## [0.1.3] - 2026-03-18

### 🐛 Bug Fixes

- Inline content files at build time via rollup md plugin (fixes empty managed sections when bundled into consumers)

### ⚙️ Miscellaneous Tasks

- Release v0.1.3
## [0.1.2] - 2026-03-18

### 🐛 Bug Fixes

- Use package-directory for content file resolution (fixes empty managed sections)

### ⚙️ Miscellaneous Tasks

- Release v0.1.2
## [0.1.1] - 2026-03-17

### 🚀 Features

- Add async content cache helper for sync generateToolsContent

### 🐛 Bug Fixes

- Resolve package.json from dist/ via directory walk (fixes MODULE_NOT_FOUND when consumed as dependency)
- Use package-directory instead of hand-rolled package.json resolution

### ⚙️ Miscellaneous Tasks

- Release v0.1.1
## [0.1.0] - 2026-03-17

### 🚀 Features

- Author content files for Tasks 11-15
- Core library foundation (Tasks 1-6a, 7-9)
- Tasks 10, 16-22 — refreshPlatformContent, CLI commands, integration tests

### 🐛 Bug Fixes

- Read CORE_VERSION from package.json instead of hardcoding
- Add DO NOT EDIT to markers, H1 title in section mode, fix tests to use constants

### 💼 Other

- Initial commit
- Revise Genesis section and attribution wording

Updated the Genesis section and improved the attribution line.
- Refactor poem layout in soul-section.md

Reformat poem for clarity and add line breaks.
- Update README with clearer installation and identity info

Rephrase installation instructions and improve clarity about Jeeves' identity and functionality.
- Refactor OpenClaw description for clarity
- Update documentation links in README.md
- Updated settings
- White background instead of transparent
- Update project title in README with emoji
- Change header order in README.md
- Remove historical context from README

Removed historical context about the 1930s ports from the README.
- Update README.md

### 🚜 Refactor

- Extract shared CLI defaults to cliDefaults.ts (DRY)
- Extract sortSectionsByOrder, use CLEANUP_FLAG constant (DRY)

### 📚 Documentation

- Author README, TypeDoc guides, fix all TSDoc warnings
- Rewrite README - Jeeves bootstraps an identity, not just plumbing
- First-person SOUL, move operational gates to AGENTS, README storytelling + pronouns + links
- README rewrite - tell the story, don't sell it
- Clarify OpenClaw vs Jeeves responsibilities
- Dynamic files, component onboarding narrative, restore haiku + footer
- Add PlantUML diagrams, front matter titles, team narrative, remove template diagrams
- Em-dash discipline - add AGENTS rule, fix misuse across all docs + content

### 🧪 Testing

- Remove trivial constant-assertion tests (ports, sections)

### ⚙️ Miscellaneous Tasks

- Add top-level permissions to docs workflow (fix startup_failure)
- Release v0.1.0
