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
7. If you use `registerPromptContext` (or any other conversation hook), declare it in `package.json`: `"jeeves": { "conversationHooks": ["before_prompt_build"] }`. `jeeves install` / `jeeves update` grant `plugins.entries.<id>.hooks.allowConversationAccess: true` only to plugins that declare one; without the grant OpenClaw skips the hook. Add a test with `recordRegisteredHooks` + `validateConversationHooks` so a missing declaration fails your build.

## Removed → Replacement

| Removed (v0.x) | Replacement (v1) |
| --- | --- |
| `createComponentWriter`, `ComponentWriter`, `ComponentWriterOptions` (timer cycle, TOOLS.md section writes) | None at runtime. Always-in-context rules: `registerPromptContext`. Live state: your `*_status` tool. |
| `refreshPlatformContent`, `seedContent`, `RefreshPlatformContentOptions`, `SeedContentOptions` (SOUL/AGENTS/TOOLS refresh on every cycle) | `jeeves install` (the only writer; jeeves-tools runs it over SSH) |
| `seedSkills`, `seedSkill`, `JEEVES_SKILL_DIR`, `SKILLS_DIR` | None. Plugin skills ship via the plugin manifest (define your own constant if a build script needs the `skills` dir name) |
| Platform skills `content/skills/` (`jeeves`, `coding`, `operations`, `playbooks`, `slack-bot-provisioner`) | None in core. `jeeves install` writes no skills and never deletes skill folders written by v0.x; `jeeves uninstall` leaves `skills/` alone |
| Reference templates `content/templates/` (`spec.md`, `spec-to-code-guide.md`, written to `{configRoot}/jeeves-core/templates/`), `TEMPLATES_DIR` | None in core. The templates now ship with jeeves-tools' jeeves-coding skill. `jeeves install` writes no templates and `jeeves uninstall` no longer deletes `jeeves-core/templates/` |
| HEARTBEAT orchestration: `orchestrateHeartbeat`, `OrchestrateHeartbeatOptions`, `parseHeartbeat`, `writeHeartbeatSection`, `buildHeartbeatSection`, `HEARTBEAT_HEADING`, `HeartbeatEntry`, `ParsedHeartbeat`, `ComponentDependencies`, `checkMemoryHealth`, `MEMORY_HEARTBEAT_NAME` | None. OpenClaw's heartbeat is owner-controlled; component health is `jeeves status` / `*_status` tools. |
| Cleanup escalation and flags: `CLEANUP_FLAG`, `needsCleanup`, `jaccard`, `shingles`, `STALENESS_THRESHOLD_MS` | None. Static render replaces the whole block. |
| Multi-writer convergence: `shouldWrite`, version-stamp arbitration, `SECTION_IDS`, `SECTION_ORDER`, `SectionId` | None. One renderer, run on demand. |
| `updateManagedSection`, `removeManagedSection`, `UpdateManagedSectionOptions`, `RemoveManagedSectionOptions` (locked file I/O) | Pure `upsertManagedBlock` / `removeManagedBlock` (+ your own write) |
| `parseManaged(content, markers?)` result `.sections`, `ManagedSection` | `parseManaged(content, markers)` (markers required; no `.sections`) |
| `createPluginCli`, `CreatePluginCliOptions` (extension copy, `npm install`, `plugins.installs` / `plugins.entries` / `tools.alsoAllow` patching, `--memory` slot claim, HEARTBEAT seeding, skill seeding, `writeComponentVersion`) | `jeeves install` / `jeeves update`, which run `openclaw plugins install npm:<pkg>@<ver> --pin --accept-capabilities --force`, set `hooks.allowConversationAccess` for plugins that declare conversation hooks, write plugin config, and remove legacy `extensions/<id>` copies |
| `patchConfig`, `PluginInstallRecord`, `resolveOpenClawHome`, `resolveConfigPath` | None; don't write `openclaw.json` from plugins |
| `readComponentVersions`, `writeComponentVersion`, `removeComponentVersion`, `COMPONENT_VERSIONS_FILE`, `ComponentVersionEntry`, `ComponentVersionsState`, `WriteComponentVersionOptions`, `ComponentState` | `openclaw plugins inspect --json`; `jeeves status` probes `PLATFORM_COMPONENTS` |
| `checkRegistryVersion`, `REGISTRY_CACHE_FILE` | None. `jeeves update` resolves versions with `npm view` when it runs |
| `registryCache` (`ttlSeconds`) in core `config.json` / `CoreConfig` | None; nothing read it. New core configs omit it. Existing files that still carry it keep validating (the key is stripped on load) and it can be deleted |
| `DEFAULT_CORE_VERSION`, `isPrime` | None |
| `TOOLS_MARKERS`, `WORKSPACE_FILES.tools`, `WORKSPACE_FILES.heartbeat` | `LEGACY_TOOLS_MARKERS`, `WORKSPACE_FILES.legacyTools` (strip-only) |
| `content/tools-platform.md` (TOOLS.md platform section) | Durable guidance folded into the AGENTS block; watcher's tool hierarchy moves to the watcher plugin's prompt hook |
| `createAsyncContentCache`, `AsyncContentCacheOptions` | None (spec v1 §2.1). `registerPromptContext` accepts async providers; keep them fast |
| `proper-lockfile` (and its `signal-exit` process handlers), `handlebars` | In-house `withFileLock` (same `{file}.lock` convention); no templating needed |

## Kept (unchanged or compatible)

`init` / `getWorkspacePath` / `getConfigRoot` / `getComponentConfigDir`, `loadWorkspaceConfig`, `formatBeginMarker` (gains an optional `now` argument) / `formatEndMarker`, `resolveWorkspacePath`, `resolvePluginSetting`, `resolveOptionalPluginSetting`, `getPackageVersion`, `getPackageRoot`, `createPluginToolset`, `ok` / `fail` / `connectionFail`, `fetchJson` / `postJson` / `fetchWithTimeout`, `JeevesComponentDescriptor` / `jeevesComponentDescriptorSchema`, the service-side handlers and CLI (`createServiceCli`, `createServiceManager`, `createConfigQueryHandler`, `createConfigApplyHandler`, `createStatusHandler`), discovery (`getServiceUrl`, `getBindAddress`, ports), `atomicWrite`, `withFileLock`, `analyzeMemory`, script utilities, and the `jeeves` CLI (`install`, `uninstall`, `status`, `config`; `install` now also installs plugins, and `update` is new).

## Added

| Export | Purpose |
| --- | --- |
| `renderManagedBlock`, `upsertManagedBlock`, `removeManagedBlock`, `ManagedBlockStampOptions` | Pure managed-block transforms |
| `validateSkillFrontmatter`, `SkillFrontmatter` | `name`/`description` check for skill build steps |
| `validateConversationHooks`, `recordRegisteredHooks`, `CONVERSATION_HOOK_NAMES` | Build/test check that `package.json` `jeeves.conversationHooks` matches the conversation hooks the plugin registers |
| `atomicWrite(path, content, { mode })` | Optional file mode for the written file (backward compatible) |
| `jeeves update [packages...]`, `jeeves install [plugins...]`, plugin removal in `jeeves uninstall`, `--dry-run` on all three, `--force-reinstall` on install/update | Plugin install/update/removal through the OpenClaw CLI; an exact version that is already installed is not reinstalled (see README, CLI) |
| `jeeves install` / `jeeves update` plugin config options: `--config-root` (shared), `--runner-api-url`, `--watcher-api-url`, `--server-api-url`, `--server-plugin-key`, `--meta-api-url`, `--plugin-config <file.json>` | Writes missing (or explicitly passed) `plugins.entries.<id>.config` values through an owner-only `--batch-file` (replaces the per-plugin `npx <plugin> install` config step) |
| `registerPromptContext`, `promptContextOptionsSchema`, `PromptContextOptions`, `PromptContextProvider`, `HookRegistrationOptions`, `PromptBuild*` types | `before_prompt_build` → `{ appendSystemContext }` |
| `onPluginDispose`, `PluginLifecycleApi` | Tie resources to the plugin lifecycle |
| `PluginApi.on`, `.lifecycle`, `.logger`, `.pluginConfig` | Typed subset of the OpenClaw 2026.9.x plugin API |

## Install Flow

For a new box:

1. Install OpenClaw.
2. Install and configure the Jeeves services (runner, watcher, server, meta) under one platform config root.
3. Install the CLI and the plugins:

```bash
npm install -g @karmaniverous/jeeves
jeeves install --config-root /srv/jeeves/config --dry-run   # files, plugin config, exact openclaw commands
jeeves install --config-root /srv/jeeves/config             # content + runner/watcher/server/meta plugins at latest
```

4. Restart the gateway yourself (and jeeves-server if the CLI updated its `keys._plugin`). The CLI only prints a reminder, because it can't know whether they run in a console, as a service or in a container.

Later:

```bash
jeeves update                # every installed Jeeves plugin to latest, plus any missing config
jeeves update watcher@1.2.3  # or one plugin to a pinned version
```

Re-running either command is cheap: a plugin already installed at the resolved version is not reinstalled (`--force-reinstall` overrides), but its hook grant and missing config are still written.

`jeeves install` and `jeeves update` write each plugin's `plugins.entries.<id>.config`:

- `configRoot` is required. It comes from `--config-root`, then `--plugin-config`, then the existing value, then `JEEVES_CONFIG_ROOT` or `jeeves.config.json`. With none of them, the command fails before writing anything and lists the missing options.
- `apiUrl` defaults to the service's local port.
- The server `pluginKey` is kept equal to the server's `keys._plugin` in `{configRoot}/jeeves-server/config.json`: the plugin takes the server's key; a server without one gets the plugin's key, or a newly generated one written to both ends; different keys on the two ends fail before any change unless you pass `--server-plugin-key`, which writes both. A server config write is backed up (`config.json.bak-<timestamp>`) and atomic, changes only `keys._plugin`, and needs a jeeves-server restart. Keys are shown only as `<redacted>`. See README, _Server plugin key_.

Values already in `openclaw.json` are kept unless you pass them explicitly. See README, _Plugin config_.

jeeves-tools (not open source) will call the same CLI over SSH with fleet-pinned versions instead of running plugin installers itself:

```bash
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves install runner@<v> watcher@<v> server@<v> meta@<v> --config-root <root>'
ssh jeeves@<instance> 'source ~/.nvm/nvm.sh; jeeves update @karmaniverous/jeeves-runner-openclaw@<v>'
```

jeeves-tools no longer renders plugin config itself. It passes `--config-root` and any non-default values (or a `--plugin-config` file) to `jeeves install`.

`jeeves` exits non-zero if any `openclaw` or `npm` command fails, so the SSH exit code is the success signal.

## Existing Instances

Instances managed by v0.x keep working until their plugins are upgraded. On upgrade:

- Run `jeeves install --dry-run`, review, then `jeeves install`. It replaces the old SOUL/AGENTS blocks in place (cleanup flags included), reinstalls each plugin from npm (the v0.x path installs never count as current), sets `hooks.allowConversationAccess` for plugins that declare conversation hooks, fills in missing plugin config without touching existing values, and deletes the legacy `extensions/<id>` copy only after the npm install succeeded. Restart the gateway afterwards.
- `jeeves uninstall` now removes the Jeeves plugins as well as the managed blocks and artifacts; there is no `--plugins` option. Use `--dry-run` to see the exact `openclaw` commands first.
- TOOLS.md is no longer loaded by OpenClaw 2026.9.6. `jeeves uninstall` or `removeManagedBlock(content, LEGACY_TOOLS_MARKERS)` strips the old block. Nothing writes TOOLS.md any more; archiving the file is the owner's call.
- HEARTBEAT.md's `# Jeeves Platform Status` section is no longer maintained and can be removed.
- `{configRoot}/jeeves-core/component-versions.json` and `registry-cache.json` are no longer read or written and can be deleted, as can the `registryCache` key in `jeeves-core/config.json` (harmless if left).
- Platform skills written by v0.x under `{workspace}/skills/` (`jeeves`, `coding`, `operations`, `playbooks`, `slack-bot-provisioner`) are no longer updated. `jeeves install` and `jeeves uninstall` leave them in place; removing them is the owner's call.
- The reference templates written by v0.x to `{configRoot}/jeeves-core/templates/` are no longer updated. `jeeves install` and `jeeves uninstall` leave them in place; the maintained copies ship with jeeves-tools' jeeves-coding skill, and removing the old folder is the owner's call.
