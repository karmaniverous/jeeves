# v0.5.0 Component SDK Implementation Task

You are implementing the v0.5.0 Component SDK for @karmaniverous/jeeves.
Branch: feature/v050-component-sdk (already created, starting from v0.4.0 on main).

## Step 1: Read the spec
Read J:\domains\projects\jeeves-core\spec.md — Section 5 (Next Version: 0.5.0) contains the full design.

## Step 2: Read existing code
Read these files to understand the current architecture:
- src/index.ts
- src/component/types.ts
- src/component/ComponentWriter.ts
- src/component/heartbeatOrchestrator.ts
- src/discovery/getServiceState.ts
- src/constants/markers.ts
- src/constants/sections.ts
- src/plugin/types.ts
- src/cli/jeeves/index.ts

## Step 3: Implement in phases

### Phase 1 — Foundations (no dependencies):
- C1: Define jeevesComponentDescriptorSchema Zod schema in src/component/descriptor.ts. Replaces JeevesComponent. Include serviceName (default jeeves-${name}), configFileName, defaultPort, configSchema (nested Zod), initTemplate, onConfigApply (receives MERGED config), startCommand, generateToolsContent, sectionId, refreshIntervalSeconds (validate prime), dependencies, customCliCommands, customPluginTools.
- C2: createStatusHandler in src/api/statusHandler.ts — framework-agnostic, returns { name, version, uptime, status, health }.
- C3: createPluginCli in src/cli/plugin/createPluginCli.ts — standard -openclaw installer. install: copy dist, patch openclaw.json, --memory, HEARTBEAT entry, default config. uninstall: reverse + removeManagedSection + removeComponentVersion.

Commit: `feat: phase 1 — descriptor schema, status handler, plugin CLI`

### Phase 2 — Core factories (depend on C1):
- C4: createServiceManager in src/service/createServiceManager.ts — NSSM/systemd/launchd. Execute directly.
- C5: createConfigApplyHandler in src/api/configApplyHandler.ts — derive path, deep-merge/replace, validate, write, callback.
- C6: Replace createComponentWriter to accept descriptor only. Remove JeevesComponent, ServiceCommands, PluginCommands.

Commit: `feat: phase 2 — service manager, config apply handler, writer migration`

### Phase 3 — Consumer factories (depend on Phase 2):
- C7: createServiceCli in src/cli/service/createServiceCli.ts — 12 standard commands + customCliCommands.
- C8: createPluginToolset in src/plugin/createPluginToolset.ts — 4 standard tools.

Commit: `feat: phase 3 — service CLI factory, plugin toolset factory`

### Phase 4 — Composition:
- C9: Unified CLI — extend src/cli/jeeves/ with dynamic subcommand discovery.

Commit: `feat: phase 4 — unified CLI with dynamic subcommand discovery`

## Rules
- eslint-disable is FORBIDDEN
- Zod schemas are source of truth; types via z.infer<>
- 300 LOC limit per file
- Every non-trivial module gets *.test.ts
- TSDoc on every non-test module
- Existing codebase uses Rollup, proper-lockfile, commander
- Do NOT update CHANGELOG.md
- Run before each commit: npm run lint && npm run typecheck && npm run build && npm test
- Push after every commit
- GitHub auth: read token from J:\config\credentials\github\jgs-jeeves.token
