---
title: Migrating to v1
---

# Migrating to v1

v1 retires everything in `@karmaniverous/jeeves` that wrote to a live workspace from inside a plugin, in line with the OpenClaw 2026.9.6 upgrade runbook (decisions D1–D5). The library is now a runtime SDK. The `jeeves` CLI is the local control surface for the open-source stack: `jeeves install` is the only writer of static platform content, and it installs and updates the component plugins through the OpenClaw CLI. This page lists what was removed and what replaces it.

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
| `refreshPlatformContent`, `seedContent`, `RefreshPlatformContentOptions`, `SeedContentOptions` (SOUL/AGENTS/TOOLS refresh on every cycle) | `jeeves install` (the only writer; jeeves-tools runs it over SSH) |
| `seedSkills`, `seedSkill`, `JEEVES_SKILL_DIR` | `jeeves install` writes the core skills; plugin skills ship via the plugin manifest |
| HEARTBEAT orchestration: `orchestrateHeartbeat`, `OrchestrateHeartbeatOptions`, `parseHeartbeat`, `writeHeartbeatSection`, `buildHeartbeatSection`, `HEARTBEAT_HEADING`, `HeartbeatEntry`, `ParsedHeartbeat`, `ComponentDependencies`, `checkMemoryHealth`, `MEMORY_HEARTBEAT_NAME` | None. OpenClaw's heartbeat is owner-controlled; component health is `jeeves status` / `*_status` tools. |
| Cleanup escalation and flags: `CLEANUP_FLAG`, `needsCleanup`, `jaccard`, `shingles`, `STALENESS_THRESHOLD_MS` | None. Static render replaces the whole block. |
| Multi-writer convergence: `shouldWrite`, version-stamp arbitration, `SECTION_IDS`, `SECTION_ORDER`, `SectionId` | None. One renderer, run on demand. |
| `updateManagedSection`, `removeManagedSection`, `UpdateManagedSectionOptions`, `RemoveManagedSectionOptions` (locked file I/O) | Pure `upsertManagedBlock` / `removeManagedBlock` (+ your own write) |
| `parseManaged(content, markers?)` result `.sections`, `ManagedSection` | `parseManaged(content, markers)` (markers required; no `.sections`) |
| `createPluginCli`, `CreatePluginCliOptions` (extension copy, `npm install`, `plugins.installs` / `plugins.entries` / `tools.alsoAllow` patching, `--memory` slot claim, HEARTBEAT seeding, skill seeding, `writeComponentVersion`) | `jeeves install` / `jeeves update`, which run `openclaw plugins install npm:<pkg>@<ver> --pin --accept-capabilities --force`, set `hooks.allowConversationAccess`, and remove legacy `extensions/<id>` copies |
| `patchConfig`, `PluginInstallRecord`, `resolveOpenClawHome`, `resolveConfigPath` | None; don't write `openclaw.json` from plugins |
| `readComponentVersions`, `writeComponentVersion`, `removeComponentVersion`, `COMPONENT_VERSIONS_FILE`, `ComponentVersionEntry`, `ComponentVersionsState`, `WriteComponentVersionOptions`, `ComponentState` | `openclaw plugins inspect --json`; `jeeves status` probes `PLATFORM_COMPONENTS` |
| `checkRegistryVersion`, `REGISTRY_CACHE_FILE` | None. `jeeves update` resolves versions with `npm view` when it runs |
| `DEFAULT_CORE_VERSION`, `isPrime` | None |
| `TOOLS_MARKERS`, `WORKSPACE_FILES.tools`, `WORKSPACE_FILES.heartbeat` | `LEGACY_TOOLS_MARKERS`, `WORKSPACE_FILES.legacyTools` (strip-only) |
| `content/tools-platform.md` (TOOLS.md platform section) | Durable guidance folded into the AGENTS block and the `jeeves` skill; watcher's tool hierarchy moves to the watcher plugin's prompt hook |
| `createAsyncContentCache`, `AsyncContentCacheOptions` | None (spec v1 §2.1). `registerPromptContext` accepts async providers; keep them fast |
| `proper-lockfile` (and its `signal-exit` process handlers), `handlebars` | In-house `withFileLock` (same `{file}.lock` convention); no templating needed |

## Kept (unchanged or compatible)

`init` / `getWorkspacePath` / `getConfigRoot` / `getComponentConfigDir`, `loadWorkspaceConfig`, `resolveWorkspacePath`, `resolvePluginSetting`, `resolveOptionalPluginSetting`, `getPackageVersion`, `getPackageRoot`, `createPluginToolset`, `ok` / `fail` / `connectionFail`, `fetchJson` / `postJson` / `fetchWithTimeout`, `JeevesComponentDescriptor` / `jeevesComponentDescriptorSchema`, the service-side handlers and CLI (`createServiceCli`, `createServiceManager`, `createConfigQueryHandler`, `createConfigApplyHandler`, `createStatusHandler`), discovery (`getServiceUrl`, `getBindAddress`, ports), `atomicWrite`, `withFileLock`, `analyzeMemory`, script utilities, and the `jeeves` CLI (`install`, `uninstall`, `status`, `config`; `install` now also installs plugins, and `update` is new).

## Added

| Export | Purpose |
| --- | --- |
| `renderManagedBlock`, `upsertManagedBlock`, `removeManagedBlock`, `formatBeginMarker`, `formatEndMarker` | Pure managed-block transforms |
| `validateSkillFrontmatter`, `SkillFrontmatter` | `name`/`description` check for skill build steps |
| `jeeves update [packages...]`, `jeeves install [plugins...]`, `jeeves uninstall --plugins`, `--dry-run` on all three | Plugin install/update/removal through the OpenClaw CLI (see README, CLI) |
| `registerPromptContext`, `promptContextOptionsSchema`, `PromptBuild*` types | `before_prompt_build` → `{ appendSystemContext }` |
| `onPluginDispose`, `PluginLifecycleApi` | Tie resources to the plugin lifecycle |
| `PluginApi.on`, `.lifecycle`, `.logger`, `.pluginConfig` | Typed subset of the OpenClaw 2026.9.x plugin API |

## Install Flow

For open-source users (OpenClaw already installed):

```bash
npm install -g @karmaniverous/jeeves
jeeves install --dry-run     # prints files and the exact openclaw commands
jeeves install               # content + runner/watcher/server/meta plugins at latest
jeeves update                # later: every installed Jeeves plugin to latest
jeeves update watcher@1.2.3  # or one plugin to a pinned version
```

jeeves-tools (not open source) will call the same CLI over SSH with fleet-pinned versions instead of running plugin installers itself:

```bash
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves install runner@<v> watcher@<v> server@<v> meta@<v>'
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves update @karmaniverous/jeeves-runner-openclaw@<v>'
```

`jeeves` exits non-zero if any `openclaw` or `npm` command fails, so the SSH exit code is the success signal.

## Existing Instances

Instances managed by v0.x keep working until their plugins are upgraded. On upgrade:

- Run `jeeves install --dry-run`, review, then `jeeves install`. It replaces the old SOUL/AGENTS blocks in place (cleanup flags included), reinstalls each plugin from npm, sets `hooks.allowConversationAccess`, and deletes the legacy `extensions/<id>` copy only after the npm install succeeded. Restart the gateway afterwards.
- TOOLS.md is no longer loaded by OpenClaw 2026.9.6. `jeeves uninstall` or `removeManagedBlock(content, LEGACY_TOOLS_MARKERS)` strips the old block. Nothing writes TOOLS.md any more; archiving the file is the owner's call.
- HEARTBEAT.md's `# Jeeves Platform Status` section is no longer maintained and can be removed.
- `{configRoot}/jeeves-core/component-versions.json` and `registry-cache.json` are no longer read or written and can be deleted.
