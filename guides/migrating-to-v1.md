---
title: Migrating to v1
---

# Migrating to v1

v1 retires everything in `@karmaniverous/jeeves` that wrote to a live workspace or installed plugins, in line with the OpenClaw 2026.9.6 upgrade runbook (decisions D1–D5). Core is now static content plus a runtime SDK. This page lists what was removed and what replaces it.

## Summary for Plugin Authors

1. Delete your `createComponentWriter(...)` call and `writer.start()` / `writer.stop()` wiring.
2. Delete your plugin CLI (`createPluginCli`) and the `bin` entry that exposed it.
3. Move any rule that must always be in context from `generateToolsContent` into `registerPromptContext(api, { content })`. Move everything else into your skill or behind a tool.
4. Drop `sectionId`, `refreshIntervalSeconds`, `generateToolsContent`, and `dependencies` from your descriptor. (Zod strips them if you forget, so this is not a hard break at parse time, but TypeScript will flag them.)
5. Declare your skill in `openclaw.plugin.json` (`"skills": [...]`) and ship it in the package.
6. Make sure nothing in your plugin installs process signal handlers or leaves timers running; use `onPluginDispose`.
7. Document that users need `plugins.entries.<id>.hooks.allowConversationAccess: true` if you use `registerPromptContext`.

## Removed → Replacement

| Removed (v0.x) | Replacement (v1) |
| --- | --- |
| `createComponentWriter`, `ComponentWriter`, `ComponentWriterOptions` (timer cycle, TOOLS.md section writes) | None at runtime. Always-in-context rules: `registerPromptContext`. Live state: your `*_status` tool. |
| `refreshPlatformContent`, `seedContent`, `RefreshPlatformContentOptions`, `SeedContentOptions` (SOUL/AGENTS/TOOLS refresh on every cycle) | `renderPlatformContent` / `upsertPlatformSection`, applied once by jeeves-tools at instance creation/deploy or by `jeeves install` |
| `seedSkills`, `seedSkill`, `JEEVES_SKILL_DIR` | `PLATFORM_SKILLS` (core skills, rendered by the installer); plugin skills ship via the plugin manifest |
| HEARTBEAT orchestration: `orchestrateHeartbeat`, `OrchestrateHeartbeatOptions`, `parseHeartbeat`, `writeHeartbeatSection`, `buildHeartbeatSection`, `HEARTBEAT_HEADING`, `HeartbeatEntry`, `ParsedHeartbeat`, `ComponentDependencies`, `checkMemoryHealth`, `MEMORY_HEARTBEAT_NAME` | None. OpenClaw's heartbeat is owner-controlled; component health is `jeeves status` / `*_status` tools. |
| Cleanup escalation and flags: `CLEANUP_FLAG`, `needsCleanup`, `jaccard`, `shingles`, `STALENESS_THRESHOLD_MS` | None. Static render replaces the whole block. |
| Multi-writer convergence: `shouldWrite`, version-stamp arbitration, `SECTION_IDS`, `SECTION_ORDER`, `SectionId` | None. One renderer, run on demand. |
| `updateManagedSection`, `removeManagedSection`, `UpdateManagedSectionOptions`, `RemoveManagedSectionOptions` (locked file I/O) | Pure `upsertManagedBlock` / `removeManagedBlock` (+ your own write) |
| `parseManaged(content, markers?)` result `.sections`, `ManagedSection` | `parseManaged(content, markers)` (markers required; no `.sections`) |
| `createPluginCli`, `CreatePluginCliOptions` (extension copy, `npm install`, `plugins.installs` / `plugins.entries` / `tools.alsoAllow` patching, `--memory` slot claim, HEARTBEAT seeding, skill seeding, `writeComponentVersion`) | `openclaw plugins install npm:<pkg>@<ver> --pin --accept-capabilities --force`; config (incl. `hooks.allowConversationAccess`) rendered by jeeves-tools |
| `patchConfig`, `PluginInstallRecord`, `resolveOpenClawHome`, `resolveConfigPath` | None; don't write `openclaw.json` from plugins |
| `readComponentVersions`, `writeComponentVersion`, `removeComponentVersion`, `COMPONENT_VERSIONS_FILE`, `ComponentVersionEntry`, `ComponentVersionsState`, `WriteComponentVersionOptions`, `ComponentState` | `openclaw plugins inspect --json`; `jeeves status` probes `PLATFORM_COMPONENTS` |
| `checkRegistryVersion`, `REGISTRY_CACHE_FILE` | None (update checks belong to the installer) |
| `DEFAULT_CORE_VERSION`, `isPrime` | None |
| `TOOLS_MARKERS`, `WORKSPACE_FILES.tools`, `WORKSPACE_FILES.heartbeat` | `LEGACY_TOOLS_MARKERS`, `WORKSPACE_FILES.legacyTools` (strip-only) |
| `content/tools-platform.md` (TOOLS.md platform section) | Durable guidance folded into the AGENTS block and the `jeeves` skill; watcher's tool hierarchy moves to the watcher plugin's prompt hook |
| `proper-lockfile` (and its `signal-exit` process handlers), `handlebars` | In-house `withFileLock` (same `{file}.lock` convention); no templating needed |

## Kept (unchanged or compatible)

`init` / `getWorkspacePath` / `getConfigRoot` / `getComponentConfigDir`, `loadWorkspaceConfig`, `resolveWorkspacePath`, `resolvePluginSetting`, `resolveOptionalPluginSetting`, `getPackageVersion`, `getPackageRoot`, `createPluginToolset`, `createAsyncContentCache` (now under the plugin SDK), `ok` / `fail` / `connectionFail`, `fetchJson` / `postJson` / `fetchWithTimeout`, `JeevesComponentDescriptor` / `jeevesComponentDescriptorSchema`, the service-side handlers and CLI (`createServiceCli`, `createServiceManager`, `createConfigQueryHandler`, `createConfigApplyHandler`, `createStatusHandler`), discovery (`getServiceUrl`, `getBindAddress`, ports), `atomicWrite`, `withFileLock`, `analyzeMemory`, script utilities, and the `jeeves` CLI (`install`, `uninstall`, `status`, `config`).

## Added

| Export | Purpose |
| --- | --- |
| `PLATFORM_SECTIONS`, `PLATFORM_SKILLS`, `PLATFORM_TEMPLATES` | Static platform content as data |
| `renderPlatformContent`, `upsertPlatformSection` | Pure render for installers |
| `renderManagedBlock`, `upsertManagedBlock`, `removeManagedBlock`, `formatBeginMarker`, `formatEndMarker` | Pure managed-block transforms |
| `BOOTSTRAP_FILE_MAX_CHARS`, `PLATFORM_SECTION_BUDGETS`, `PLATFORM_CONTENT_TOTAL_BUDGET` | Documented, test-enforced content budgets |
| `validateSkillFrontmatter` | `name`/`description` check for skill build steps |
| `registerPromptContext`, `promptContextOptionsSchema`, `PromptBuild*` types | `before_prompt_build` → `{ appendSystemContext }` |
| `onPluginDispose`, `PluginLifecycleApi` | Tie resources to the plugin lifecycle |
| `PluginApi.on`, `.lifecycle`, `.logger`, `.pluginConfig` | Typed subset of the OpenClaw 2026.9.x plugin API |

## Existing Instances

Instances managed by v0.x keep working until their plugins are upgraded. On upgrade:

- Re-render SOUL/AGENTS with `upsertPlatformSection` (or `jeeves install`): the old block is replaced in place, cleanup flags included.
- TOOLS.md is no longer loaded by OpenClaw 2026.9.6. `jeeves uninstall` or `removeManagedBlock(content, LEGACY_TOOLS_MARKERS)` strips the old block; archiving the file is the installer's call.
- HEARTBEAT.md's `# Jeeves Platform Status` section is no longer maintained; the installer should remove it.
- `{configRoot}/jeeves-core/component-versions.json` and `registry-cache.json` are no longer read or written and can be deleted.
