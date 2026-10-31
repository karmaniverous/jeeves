# Changelog

All notable changes to this project will be documented in this file.

## [0.8.0] - 2026-10-31

### 🚀 Features

- Add jeeves-server link-key functions (computePathKey, computeInsiderKey, computeOutsiderKeyWithExpiry)

### 🐛 Bug Fixes

- Close entry-guard gaps found in step 21 review
- Follow-up review nits (entry table test, probe, guard wording)

### 💼 Other

- Merge main: keep main's link-key implementation (#149)

main merged #149 as src/crypto.ts (same functions and output, fuller pinned-output tests); feature/135's duplicate src/linkKeys.ts, its test and README section are removed. package.json keeps feature/135's dependencies with main's dependency updates.

### 🚜 Refactor

- *(crypto)* Share one HMAC helper; document link keys in README

### ⚙️ Miscellaneous Tasks

- Update copilot review instructions
## [0.8.0-6] - 2026-10-30

### 🐛 Bug Fixes

- Make fastify, fastify-type-provider-zod and zod-openapi dependencies

### 📚 Documentation

- Jeeves-pr-review no longer mentions Copilot

### ⚙️ Miscellaneous Tasks

- Release v0.8.0-6
## [0.8.0-5] - 2026-10-30

### 🚀 Features

- Bring the runnable argument parser up to jeeves-scripts-core's (#151)

### ⚙️ Miscellaneous Tasks

- Release v0.8.0-5
## [0.8.0-4] - 2026-10-29

### 🚀 Features

- Export jeeves-server link-key functions from the root (#149)

### ⚙️ Miscellaneous Tasks

- Merge main (0.8.0-0 release commit) into feature/135
- Release v0.8.0-4
## [0.8.0-3] - 2026-10-29

### 🐛 Bug Fixes

- Declarations built in one run so Catalog is declared once (step 19 core defect)

### ⚙️ Miscellaneous Tasks

- Release v0.8.0-3
## [0.8.0-2] - 2026-10-29

### 🚀 Features

- RegisterCatalogRoutes logger option; validation issues keep Zod params (step 19, owner-approved)

### ⚙️ Miscellaneous Tasks

- Release v0.8.0-2
## [0.8.0-1] - 2026-10-29

### 🚀 Features

- Catalog model (defineCatalog, AuthSpec, errorBodySchema, queryArray, standardEntries)
- OpenAPI 3.1 document builder, writer and drift check
- Catalog-driven Fastify route registration and /openapi.json route
- Catalog request building, http transport and CatalogClientError
- Typed catalog client (createCatalogClient, ClientAuth)
- Catalog tool definition and tool result mapping
- Descriptor promptRules/skill and safeParse check; workspace path per #138
- Plugin toolset built on the catalog
- Bootstrap report names the source of each limit (#139)
- Component proxy discovery by name filter, service list and marker (#142)
- Skip OpenClaw steps when OpenClaw is not installed; atomic uninstall writes (#143)
- Jeeves-pr-review and aws-ssm-remote-ops skills; skill and AGENTS content
- Deprecate parseArgs, getArg and getChannelWorkspace; fix stale comments (#127, #144)

### 🐛 Bug Fixes

- Handler results keep literal statuses in registerCatalogRoutes
- Client wraps body-read, JSON and credential failures as status-0 errors (review #1)
- App error-handler replies bypass the catalog response schemas (review #2)
- Route registration errors reject registerCatalogRoutes (review #3)
- Invalid tool input names each field and reason (review #4)
- Request input follows the body's unknown-key mode (review #5)
- Optional-input check without an empty object type
- CreatePluginToolset names a missing standard entry (review #10)
- App error-handler replies keep strings and content type (re-review #1)
- A typed body catchall checks unnamed fields (re-review #2)
- Rule 8 lowercases only the media type (re-review #4)
- ResolveWorkspacePath falls back to OpenClaw's default silently (step 17, owner-approved)

### 💼 Other

- Add catalog, openapi and fastify entry points with optional peers
- Rule 2 treats routes differing only in parameter names as duplicates (review #7)
- Rule 8 keeps the type-level and runtime JSON checks in agreement (review #8)
- Client methods take no argument when an entry has no required input (review #9)
- One invalid-input error with field details (review #4 follow-up)

### 🚜 Refactor

- One function per catalog rule, shared schema helpers, DRY packed-consumer script
- One leading-~ expansion; cover drift lines only the generated document has
- CatalogToolSelection derived from its schema (review #6)
- OpenAPI builder uses isTextContentType (review #11)
- CatalogToolSelection derived from the exported options schema (review #6 follow-up)
- CatalogPluginToolOptions extends CatalogToolSelection (re-review #3)

### 📚 Documentation

- 0.8.0 README, migration guide and endpoint-catalog guide
- Lint-exception wording consistent across review skill and instructions (review #15)
- Endpoint-catalog guide reflects the review fixes
- Guide covers app error replies, registration errors and rule 8 wording (re-review #4, #5)

### 🧪 Testing

- Capture 0.7.0 baselines for the root export surface and standard plugin tools
- Discovery ports without calling the real npm
- 0.7.0 type compatibility for every root export
- Entry-point export lists match spec 5.1
- Commit the type-compat generator; drop the duplicate 0.7.0 declarations (review #12, #13)
- Negative type assertions without @ts-expect-error (review #14)
- App-set content type on an object error reply is kept (re-review #1)

### ⚙️ Miscellaneous Tasks

- Dependency and audit updates
- Release v0.8.0-1
## [0.8.0-0] - 2026-10-29

### 🐛 Bug Fixes

- *(release)* GitHub release notes and changelog use the new version tag

### 📚 Documentation

- Allow narrow eslint-disable-next-line exception in tests

### ⚙️ Miscellaneous Tasks

- Update copilot review instructions
- Release v0.8.0-0
## [0.7.0] - 2026-10-14

### 🚀 Features

- *(plugin)* Default timeout for fetchJson/postJson with per-call override (#119)
- *(scripts)* Hoist parseRunnableArgs and retry helpers from jeeves-scripts-core (#126)
- *(cli)* Jeeves patch-openclaw hoisted from the scripts template (#121)
- *(cli)* Install and update run the OpenClaw patch step (#121)
- *(skills)* Ship jeeves-coding and jeeves-design from the package (jeeves-tools#207)
- *(skills)* Generic jeeves-platform in the package (jeeves-tools#207, jeeves-tools#221)
- *(skills)* Self-hosted jeeves-onboarding and checklist template (jeeves-tools#207)
- *(cli)* Jeeves skills install/uninstall/status with managed and self-hosted modes (jeeves-tools#207)
- *(cli)* Install, update, uninstall and status run the skills step (jeeves-tools#207)
- *(cli)* Bootstrap-file size report after install, --strict (#120)

### 🐛 Bug Fixes

- *(skills)* Jeeves-platform pointer line passes the fleet-content guard
- Complete 0.7.0 spec review gaps
- Address Copilot review on #128

### 🚜 Refactor

- SOLID/DRY pass, upstream-fixed, test and docs gaps

### 📚 Documentation

- 0.7.0 guides and migration notes

### ⚙️ Miscellaneous Tasks

- Update dependencies
- Release v0.7.0
## [0.6.0] - 2026-09-29

### ⚙️ Miscellaneous Tasks

- Release v0.6.0
## [0.6.0-10] - 2026-09-28

### 🐛 Bug Fixes

- *(cli)* Hide expected transient OpenClaw warnings during install; restart notice only when a change was not applied live (#117, #118)

### 💼 Other

- Removed stan support

### ⚙️ Miscellaneous Tasks

- Prettier --check . passes; silence rollup config-loader outputToFilesystem notice
- Release v0.6.0-10
## [0.6.0-9] - 2026-09-28

### 🐛 Bug Fixes

- *(config-apply)* Write the merged raw config and keep the file mode (#113, #114)
- *(service)* System units via plain systemctl + polkit (no sudo under NoNewPrivileges); status names the unit (#115, #116)

### 📚 Documentation

- Config apply semantics; polkit-based service management and status detail (#113-#116)

### 🎨 Styling

- *(tsdoc)* Keep a code span on one line (lint 0 warnings)

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-9
## [0.6.0-8] - 2026-09-27

### 🐛 Bug Fixes

- *(install)* Survive gateway reload stalls during plugin installs (#112)

### 📚 Documentation

- *(install)* Reference openclaw/openclaw#159698; test hook grant rides the single config write (#112)

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-8
## [0.6.0-7] - 2026-09-27

### 🚀 Features

- *(service)* Manage existing Linux system units in place; fail fast without a user bus (#111)

### 🐛 Bug Fixes

- *(release)* Build after the version bump so dist inlines the published CORE_VERSION (#110)

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-7
## [0.6.0-6] - 2026-09-26

### 🐛 Bug Fixes

- Declare @commander-js/extra-typings as a runtime dependency and guard .d.ts imports

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-6
## [0.6.0-5] - 2026-09-26

### 🚀 Features

- [**breaking**] CreatePluginToolset options argument is required

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-5
## [0.6.0-4] - 2026-09-26

### 🐛 Bug Fixes

- CreatePluginToolset calls the plugin's apiUrl, defaultPort only as fallback

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-4
## [0.6.0-3] - 2026-09-26

### 🐛 Bug Fixes

- Write each plugin's config before its install, then sweep

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-3
## [0.6.0-2] - 2026-09-26

### 🐛 Bug Fixes

- Sweep pending plugin migrations before config writes and before each retry

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-2
## [0.6.0-1] - 2026-09-26

### 🐛 Bug Fixes

- Retry config writes while freshly installed plugins converge

### ⚙️ Miscellaneous Tasks

- Release v0.6.0-1
## [0.6.0-0] - 2026-09-26

### 🚀 Features

- [**breaking**] Static-only platform content; retire installer CLI and ComponentWriter (#108)
- *(cli)* Install and update Jeeves plugins through the OpenClaw CLI
- *(cli)* Write plugin config in jeeves install
- *(cli)* Batch-file config writes, idempotent installs, declared hook grants, update fills config, uninstall removes plugins
- *(cli)* Keep the server pluginKey and jeeves-server keys._plugin in step
- *(plugin)* ValidateConversationHooks build check for declared conversation hooks
- *(cli)* Edit keys._plugin in place with jsonc-parser
- [**breaking**] Jeeves install no longer writes platform skills
- [**breaking**] Drop registryCache from the core config schema
- [**breaking**] Drop the spec templates from core
- [**breaking**] Drop the unused SKILLS_DIR export

### 🐛 Bug Fixes

- *(api)* Narrow jsonpath-plus 11 unknown result in config query
- Serialise stale lock takeover so a freshly re-taken lock is never deleted
- Redact JSON-escaped secrets in batch file output

### 💼 Other

- Revert "[108] feat(cli): edit keys._plugin in place with jsonc-parser"

This reverts commit 8e1c92c6d5f4c14770861db50e3bb0ad6889749d.

### 🚜 Refactor

- [**breaking**] Make static platform content internal to the jeeves CLI
- [**breaking**] Remove createAsyncContentCache
- Share isRecord, getErrorCode, getErrorMessage and exit formatting
- Drive per-plugin config, CLI options and id mapping from one descriptor table
- Separate plan building, step description and command-line formatting
- Share CLI run output, install options and service probing across commands
- Tidy module names, internal exports and stale docs
- Dedupe test fixtures (temp dirs, console capture, command deps, plugin ids)

### 📚 Documentation

- Jeeves CLI owns content and plugin install
- Plugin config options and new-box flow
- Batch-file writes, idempotent installs, declared conversation hooks, update config, uninstall removes plugins
- Server plugin key sync and the conversation hook build check
- Sync README, guides, skill, diagram sources and TSDoc with #109 code
- Regenerate diagram PNGs from updated PlantUML sources
- Core ships no skills; registryCache removed
- Regenerate diagram PNGs without the skills output
- Core ships no spec templates
- Regenerate managed-content-lifecycle diagram without templates
- Spec templates ship with the jeeves-design skill

### 🎨 Styling

- Apply prettier 3.9 union formatting

### 🧪 Testing

- Cover plugin workflow gaps (runner errors, inspect specs, key sync, file-sourced pluginKey, server-write failure, deps wiring)
- Cover file lock races, managed block removal, frontmatter blocks, config query edge cases
- Cover install/uninstall/status command paths (content-only, default targets, responding services, memory hygiene)
- Remove duplicate and constant-only tests, make descriptor hook tests able to fail

### ⚙️ Miscellaneous Tasks

- Delete stale root TOOLS.md snapshot
- Release v0.6.0-0
## [0.5.12] - 2026-06-11

### 🐛 Bug Fixes

- *(plugin)* Run npm install in extension directory (#103)
- *(api)* Accept explicit configPath in createConfigApplyHandler (#104)

### ⚙️ Miscellaneous Tasks

- Add copilot review instructions
- Release v0.5.12
## [0.5.11] - 2026-05-29

### 🚀 Features

- Hoist substituteEnvVars to core (closes #90)
- Hoist Slack file download fallback to platform content (closes #93)

### 🐛 Bug Fixes

- Reject Windows drive-letter paths on non-Windows platforms (closes #100)
- Validate drive-letter paths before resolve() in initFromOptions (closes #100)

### 💼 Other

- Npm audit fix

### 🧪 Testing

- Add substituteEnvVars immutability test

### ⚙️ Miscellaneous Tasks

- Migrate changelog to git-cliff (closes #95)
- Update dependencies
- Update lefthook, fix lint from typescript-eslint 8.60
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

### 🐛 Bug Fixes

- Revert version bump (release is owner-controlled)
- Race condition in start() during finishing cycle, remove redundant nullish coalescing

### 💼 Other

- [85,86,87,76,79,72] feat: ComponentWriter lifecycle fix, staleness removal, Handlebars migration, content updates, docs

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
- Npm audit fix

### 🚜 Refactor

- Hoist workspace config load to ComponentWriter cycle (DRY)

### 🧪 Testing

- Add restart lifecycle and devRepos schema coverage

### ⚙️ Miscellaneous Tasks

- Bump version to 0.5.9, update deps, fix lint warnings from updated eslint rules
- Release v0.5.9
## [0.5.8] - 2026-04-22

### 🐛 Bug Fixes

- Resolve config apply path from registered override (#83) and downgrade transient fetch errors to concise warnings (#77)
- Traverse full error cause chain for transient classification

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

### 🐛 Bug Fixes

- Preserve dist/ subdirectory in plugin install layout

### ⚙️ Miscellaneous Tasks

- Release v0.5.5
## [0.5.4] - 2026-04-05

### 🐛 Bug Fixes

- [**breaking**] Replace distDir param with importMetaUrl in createPluginCli
- Validate dist directory exists before copying

### 💼 Other

- Npm audit fix

### ⚙️ Miscellaneous Tasks

- Release v0.5.4
## [0.5.3] - 2026-04-05

### 🚀 Features

- V0.5.2 patch release

### 🐛 Bug Fixes

- Complete v0.5.2 spec implementation
- Address Gemini review feedback on PR #71

### 🚜 Refactor

- SOLID/DRY pass across codebase

### 📚 Documentation

- Sync docs with v0.5.2 implementation

### 🧪 Testing

- Add missing test coverage for utils and workspace health

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

### 🐛 Bug Fixes

- Call init() before descriptor.run() in start command

### ⚙️ Miscellaneous Tasks

- Release v0.4.6
## [0.4.5] - 2026-03-30

### 🐛 Bug Fixes

- Replace spawn recursion with descriptor.run in start command

### ⚙️ Miscellaneous Tasks

- Remove temp scripts
- Remove remaining temp scripts
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

### 🚀 Features

- Implement v0.3.0 dev plan — remove probing, SDK cleanup, content updates

### 🐛 Bug Fixes

- Remove dead code, replace Handlebars markers with HTML comments

### 🚜 Refactor

- SOLID/DRY cleanup — extract fetchWithTimeout, remove deprecated re-export

### 🧪 Testing

- Close coverage gaps — fetchWithTimeout, statusCommand, template branches
- Remove trivial tests — type-assignability checks, tautological assertions

### ⚙️ Miscellaneous Tasks

- Remove temp script
- Release v0.3.0
## [0.2.0] - 2026-03-20

### 🚀 Features

- Phase 1 — Plugin SDK types and utilities
- Phase 2 — Managed content removal, semver fix, component versions
- Phase 3 — Config query handler with JSONPath support

### 🐛 Bug Fixes

- Patch tools.alsoAllow, read component versions in platform refresh, consolidate resolveWorkspacePath

### 💼 Other

- Npm audit fix

### 🚜 Refactor

- Extract shared fileOps (atomicWrite, withFileLock, constants) from managed section files
- Extract buildServiceRows from refreshPlatformContent
- Extract ManagedMarkers interface from inline types

### 📚 Documentation

- Update README and guides for v0.2.0 Plugin SDK

### 🧪 Testing

- Add 400 error path test for invalid JSONPath in configQuery

### ⚙️ Miscellaneous Tasks

- Remove stray _push.cjs helper script
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
