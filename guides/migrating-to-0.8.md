---
title: Migrating to 0.8.0
---

# Migrating to 0.8.0

0.8.0 is non-breaking for the Jeeves components: nothing is removed, no signature changes, and the new endpoint catalog is opt-in. A few behaviours are corrected (below); check them against your component. Packages pinned to `^0.7.0` stay on 0.7.x until they raise their range.

## New

- **Endpoint catalog.** Three new entry points:
  - `@karmaniverous/jeeves/catalog`: `defineCatalog`, `standardEntries`, `queryArray`, `errorBodySchema`, `buildCatalogRequest`, `httpTransport`, `createCatalogClient`, `CatalogClientError`, `catalogToolDefinition`, `toolResultFromResponse`, `toToolName`.
  - `@karmaniverous/jeeves/openapi`: `buildOpenApiDocument`, `writeOpenApiDocument`, `checkOpenApiDrift`.
  - `@karmaniverous/jeeves/fastify`: `registerCatalogRoutes`, `registerOpenApiRoute`, `standardHandlers`.

  `fastify`, `fastify-type-provider-zod` and `zod-openapi` are dependencies of this package; you don't install them yourself. Only the entry point that needs one imports it.

  `@karmaniverous/jeeves/mcp` is reserved for a later release. How to adopt the catalog: [Adopting the Endpoint Catalog](endpoint-catalog.md).

- **`createPluginToolset`** takes `catalog`, `tools`, `auth` and `api`. The standard tools are now built from the catalog's standard entries and gain an optional `replace` on `{name}_config_apply`. Names, descriptions, results, requests and timeouts are unchanged from 0.7.0. Their parameters now include the keywords Zod's JSON Schema conversion adds (`additionalProperties: false`, and `propertyNames` on the `config` patch).
- **`ToolDescriptor.catalogMode`**: `'direct-only'` keeps a tool visible to the model under OpenClaw's Tool Search.
- **Descriptor fields** `promptRules` and `skill` (strings). Core registers neither: the plugin passes `promptRules` to `registerPromptContext`, and the plugin's build writes `skill` as its `SKILL.md`.
- **`PluginContext`** type and an optional `ctx` parameter on `resolveWorkspacePath(api, ctx?)`.
- **jeeves-server link keys** (#149): `computeInsiderKey`, `computePathKey` and `computeOutsiderKeyWithExpiry`, identical to jeeves-server's own.
- **Runnable argument parser** (#151), brought up to jeeves-scripts-core's: an optional `description` on every spec entry (`argFlag(name, description?)`, `{ description }` on `argValue`/`argOptional`), `unknownArgs(args, spec, positionals?)` and `valuelessArgs(args, spec)`. Existing calls are unaffected.
- **Skills:** `jeeves-pr-review` (finishing a PR and the independent review that replaces Copilot review) and `aws-ssm-remote-ops`. `jeeves-coding` and `jeeves-platform` gain rules on GitHub identity, encodings, restarts and deploy checks. The managed AGENTS block adds that outsider share links are a human decision.

## Behaviour corrections

Each fixes a defect; none changes a signature.

| Issue | Before | Now | Check |
| --- | --- | --- | --- |
| #138 | With `agents.defaults.workspace` unset, `resolveWorkspacePath(api)` returned the **plugin root** (`api.resolvePath('.')`), or `process.cwd()`. | It returns `ctx.workspaceDir` when you pass a context, else OpenClaw's default workspace (`$OPENCLAW_STATE_DIR/workspace`, `~/.openclaw-<profile>/workspace` or `~/.openclaw/workspace`). It never returns the plugin root and never throws. | Anything that found files relative to the plugin root through this function. Pass `ctx` from hooks and tool factories where you have it. |
| #139 | The bootstrap report said OpenClaw's limits couldn't be read when they simply weren't set. | One notice naming the source: "could not read OpenClaw's bootstrap limits", "OpenClaw's bootstrap limits are not set", or "bootstrap limits not read (--content-only)"; none when they come from config. | Scripts matching the old wording. |
| #141 | `configSchema` passed descriptor validation with only a `parse` method. | It must also have `safeParse` (any Zod schema does). | Hand-rolled schema stand-ins. |
| #142 | `jeeves <name>` proxies were added for every global `@karmaniverous/jeeves-*` package except `-openclaw` plugins, including `jeeves-tools`. | Proxies are added for `runner`, `watcher`, `server` and `meta`, and for packages whose `package.json` has `"jeeves": { "component": true }`; names may contain hyphens. The bin runs under Node without a shell, and `--help` goes to the component. | A new component CLI needs the `jeeves.component` marker. |
| #143 | With no OpenClaw installed, `jeeves uninstall`'s skills step and `jeeves status`'s skills summary failed. | Uninstall's plugin and skills steps print "OpenClaw not installed; skipped" and exit 0; `status` prints "skipped (OpenClaw not installed)" for skills. `install` and `update` still require OpenClaw. Uninstall rewrites SOUL.md and AGENTS.md atomically. | - |

## Deprecated

Marked `@deprecated`, removed in 4.0.0:

- `parseArgs`, `getArg`: use `parseRunnableArgs`.
- `getChannelWorkspace`: no remaining consumer.

Code linting with typescript-eslint `strictTypeChecked` (which includes `no-deprecated`) fails on any use of them.

## When you adopt the catalog

None of this applies until you call `registerCatalogRoutes`:

- **Responses are checked.** With the default `responseValidation: 'strict'`, a handler body that doesn't match its schema is replaced with 500 `{ error: 'Response validation failed' }`. Zod also drops object keys a schema doesn't name, so name every field or use `z.looseObject`. Migrate with `responseValidation: 'log'`, test that each serialised response equals the handler's body, then switch to `'strict'`.
- **Requests are validated** by the catalog schemas, which may reject requests your handlers used to accept loosely (unknown fields, wrong types, numbers in query strings without `z.coerce`). Invalid requests get 400; pass `formatValidationError` to keep your own error body.
- **Auth is yours.** `auth` only describes a route. Add your auth hook to the root app **before** `registerCatalogRoutes`, exempt `/openapi.json`, and test that each protected entry rejects a request without credentials.
- **Plugin credentials.** `createPluginToolset` sends `auth` only when you pass a `catalog`, and only to entries whose `auth` lists the scheme.
