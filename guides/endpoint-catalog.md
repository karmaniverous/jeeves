---
title: Adopting the Endpoint Catalog
---

# Adopting the Endpoint Catalog

From 0.8.0 a component can describe its HTTP API once, as a **catalog**, and get from it:

- service routes with request validation and checked responses (`@karmaniverous/jeeves/fastify`);
- an OpenAPI 3.1 document with a drift check (`@karmaniverous/jeeves/openapi`);
- a typed client (`@karmaniverous/jeeves/catalog`);
- plugin tools whose parameters and results match the routes (`createPluginToolset` from the root entry point).

Adoption is optional and per component. A component that doesn't adopt keeps working unchanged. This guide walks through adopting it, package by package, in the usual three-package layout: `core`, `service` and `openclaw`.

## 1. Dependencies

| Package | Add |
| --- | --- |
| `core` | `@karmaniverous/jeeves` (already there), `zod` `^4.6`; `zod-openapi` `^6` as a dev dependency (writes `openapi.json`) |
| `service` | `fastify` `^5` (your app) |
| `openclaw` | nothing new |

`fastify` and `zod-openapi` are optional peers of `@karmaniverous/jeeves`: `/fastify` needs `fastify` (types; your app's own instance does the work) and `/openapi` needs `zod-openapi`. The root and `/catalog` need neither, so an SDK built on `createCatalogClient` stays light. Core validates requests itself; you don't need `fastify-type-provider-zod` unless the service uses it for its own routes outside the catalog.

Use one copy of Zod: catalog schemas are built with your `zod` and core reads them, so declare `zod` as `^4.6` wherever you declare it, and check `npm ls zod` shows a single version.

## 2. Define the catalog in `core`

```ts
import {
  defineCatalog,
  queryArray,
  standardEntries,
} from '@karmaniverous/jeeves/catalog';
import { z } from 'zod';

const bearer = { schemes: [{ in: 'bearer' }] } as const;

export const catalog = defineCatalog([
  ...standardEntries('acme', {
    auth: { config: bearer },
    healthSchema: z.looseObject({ indexed: z.number() }),
  }),
  {
    name: 'search',
    method: 'POST',
    path: '/search',
    description: 'Search the archive.',
    body: z.object({ query: z.string(), limit: z.number().optional() }),
    response: z.object({ hits: z.array(z.string()) }),
    auth: bearer,
    kind: 'read',
  },
  {
    name: 'listTags',
    method: 'GET',
    path: '/tags',
    description: 'List tags, optionally filtered.',
    query: z.object({ prefix: queryArray(z.string()).optional() }),
    response: z.object({ tags: z.array(z.string()) }),
    auth: 'none',
    kind: 'read',
  },
]);
```

Each entry has a camelCase `name`, a `method` (`GET`, `POST`, `PUT`, `PATCH` or `DELETE`; by default Fastify answers `HEAD` for every `GET` route), a Fastify-syntax `path` (`:param`, or `*` for the rest of the path), a `description`, optional `params`/`query`/`body` Zod objects, a `response` schema, an `auth` description and a `kind` (`read`, `write` or `destructive`). Non-JSON entries set `contentType` and respond with `z.instanceof(Uint8Array)` or `z.string()`. A content type's media type is lowercase (parameters such as `charset=UTF-8` may not be), and it contains `json`, in lowercase, exactly when it is JSON: a `json` subtype or a `+json` suffix, such as `application/json`, `application/problem+json` or `application/json-seq`.

`defineCatalog` checks the rules MCP and the tools rely on, and throws `CatalogDefinitionError` listing every violation:

- names are camelCase and unique; `method` + `path` pairs are unique, ignoring parameter names (`GET /a/:x` and `GET /a/:y` are the same route);
- `params` keys equal the path's parameters; no field appears in more than one of `params`, `query` and `body`;
- query fields are strings, string enums or literals, `z.coerce.*`, `z.stringbool()` or `queryArray(item)`, because Fastify delivers query values as strings and a single repeated key as a string, not an array;
- every schema converts to JSON Schema. Use codecs (`z.codec`) in request schemas rather than `z.transform` (which doesn't convert) or `z.preprocess` (which misdescribes the wire shape).

**Standard entries.** `standardEntries(name, { auth: { config, status? }, healthSchema? })` describes the `status`, `config` and `configApply` routes every component already has, with the component's name in their descriptions. Remove your own entries for those routes: a duplicate name or route is rejected. `auth.config` is required: say how your `/config` routes are protected today. `status` defaults to `'none'`.

**`auth` describes; you enforce.** An entry's `auth` lists the credentials the route accepts (`bearer`, or a named `header`, `query` or `cookie`; `insiderOnly` for jeeves-server). It feeds the OpenAPI security schemes and tells the client and tools which credential to attach. It doesn't protect the route: your own auth hook still does.

## 3. Rules and skill in `core`

Export the always-on rules text and the skill from `core` as well, and put them on the descriptor:

```ts
export const descriptor = jeevesComponentDescriptorSchema.parse({
  // ...name, version, ports, configSchema, etc.
  promptRules, // always-on rules text
  skill, // contents of SKILL.md
});
```

Core registers neither. The plugin passes `promptRules` to `registerPromptContext`, and the plugin's build writes `skill` as `SKILL.md` into the folder its `openclaw.plugin.json` lists under `skills` (for the watcher, `dist/skills/jeeves-watcher`). Keeping both in `core` lets the plugin and the service reach them without resolving paths into another package.

## 4. OpenAPI document and drift check in `core`

Commit the generated document, rewrite it from a build script, and fail a test when it drifts:

```ts
// scripts/write-openapi.ts
import { writeOpenApiDocument } from '@karmaniverous/jeeves/openapi';

import { catalog } from '../src/catalog.js';

writeOpenApiDocument(
  catalog,
  { title: 'acme', version: '1.0.0' },
  'openapi.json',
);
```

```ts
// src/openapi.test.ts
import { checkOpenApiDrift } from '@karmaniverous/jeeves/openapi';
import { expect, it } from 'vitest';

import { catalog } from './catalog.js';

it('openapi.json matches the catalog', () => {
  const result = checkOpenApiDrift(
    catalog,
    { title: 'acme', version: '1.0.0' },
    'openapi.json',
  );
  expect(result.diff).toBeUndefined();
  expect(result.ok).toBe(true);
});
```

Neither needs Fastify. `buildOpenApiDocument` returns the document if you want it in memory.

## 5. Routes in `service`

```ts
import {
  registerCatalogRoutes,
  registerOpenApiRoute,
  standardHandlers,
} from '@karmaniverous/jeeves/fastify';

// 1. Your auth hook first, on the root app, exempting /openapi.json.
app.addHook('onRequest', authHook);

// 2. Then the catalog routes.
await registerCatalogRoutes(app, catalog, {
  ...standardHandlers({
    status: createStatusHandler({/* ... */}),
    config: createConfigQueryHandler(() => getConfig()),
    configApply: createConfigApplyHandler(descriptor),
  }),
  search: async ({ body }) => ({ status: 200, body: await search(body) }),
  listTags: async ({ query }) => ({
    status: 200,
    body: { tags: await tags(query.prefix ?? []) },
  }),
});

// 3. The committed document, unauthenticated.
registerOpenApiRoute(app, openApiDocument);
```

- **Handlers** get `{ params, query, body }` (parsed by the catalog schemas) and the Fastify request, and return `{ status, body, headers? }`. A missing or extra handler is a type error. Errors return a 4xx/5xx status with a `{ message, code? }` body, or throw (see [Errors](#errors)).
- **Auth hook order.** The routes are registered in an encapsulated Fastify plugin, so add your auth hook to the root app **before** `registerCatalogRoutes`. Test it: each protected entry without credentials gets 401; each `'none'` entry doesn't.
- **Invalid requests** get Fastify's own 400: `code: 'FST_ERR_VALIDATION'` and a `message` such as `body/name Too small: expected string to have >=1 characters`.
- **Responses are checked** against the entry's `response` schema (and the error schema for 4xx/5xx). With `responseValidation: 'strict'`, the default, a mismatch is logged at `error` and replaced with a 500 whose `code` is `JEEVES_RESPONSE_VALIDATION`. Zod also drops object keys a schema doesn't name, so **name every field, or use `z.looseObject`**. Mismatches are logged through Fastify's logger; if your app runs Fastify with `logger: false` and logs elsewhere, pass `logger` (anything with pino-style `warn(details, message)` and `error(details, message)`). While migrating, pass `responseValidation: 'log'`: a mismatch is logged at `warn` and the handler's body is sent unchanged. Add a test that each serialised response equals the handler's body, then switch to `'strict'`.
- **Registration errors** (for example a route your app already declared) reject the `registerCatalogRoutes` promise.

### Errors

Every non-2xx response from a catalog route is exactly Fastify's default error body, nothing more:

```json
{
  "statusCode": 409,
  "code": "RUNNER_JOB_EXISTS",
  "error": "Conflict",
  "message": "Job j1 already exists"
}
```

| Field | Meaning |
| --- | --- |
| `statusCode` | The HTTP status. |
| `code` | Machine-readable code: Fastify's own (`FST_ERR_*`) or your service's. Present on Fastify's errors and on every deliberate error made with a code; absent otherwise (an unexpected crash, Fastify's unknown-route 404, an error sent without one). Clients must tolerate its absence. |
| `error` | The standard status text (`Bad Request`, `Conflict`, ...). |
| `message` | Human-readable. On every 5xx it is the generic `SERVER_ERROR_MESSAGE`; the cause is logged, never sent. |

- **Throw deliberate errors made with `@fastify/error`'s `createError`**, with an upper-case code in Fastify's style, never a plain `Error`:

  ```ts
  import createError from '@fastify/error';

  const JobExists = createError(
    'RUNNER_JOB_EXISTS',
    'Job %s already exists',
    409,
  );
  throw new JobExists(id);
  ```

  Or return `{ status: 409, body: { message, code } }` from the handler; the route adds `statusCode` and `error`.

- **Clients branch on `code`**, never on `message`.
- **The catalog scope answers every error itself.** A thrown error's `statusCode` (or, when it has none, its `status`) is used when it is 400 to 599, else the reply is 500; a 4xx keeps its `message` and `code`; a 5xx keeps its `code`, its `message` is replaced and the error is logged (through `logger`, else Fastify's logger). The error's `headers` (string, number or string-array values, so several `set-cookie` values are kept) are applied, as Fastify does, so a thrown 429 or 503 can carry `Retry-After`. Body headers (`content-type`, `content-encoding`, `content-length`, `transfer-encoding`) are never applied, and a name or value Node would reject (a CRLF, say, perhaps from a path parameter) is skipped and logged at `debug`, so the reply still comes from the scope. The same applies to an error result's `headers`. Set the status on the error, not the reply: `reply.code(401)` followed by a throw, or `reply.code(401).send(new Error(...))`, is answered as a 500. 4xx errors are not logged. Your app's own error handler is not consulted for catalog routes. `registerErrorHandlers(app, { logger? })` gives your other routes the same handling.
- **Error replies on catalog routes are rebuilt from the reply status**: a handler result, the scope's error handler, or a reply one of your hooks sends (root `onRequest`, `preHandler`, ...). Routes outside the catalog scope, siblings in the same plugin included, are never touched. `statusCode` and `error` come from the status, a string `code` is kept, other fields are dropped, and a 5xx's `message` is replaced with the generic one and logged, in `'strict'` and `'log'` mode alike. So send `errorBody(status, message, code?)` (exported from `/fastify`), or throw a `createError` error. A body without a string `message` (0.9's `{ error: 'Unauthorized' }`) is not repaired: in `'strict'` mode it becomes the mismatch 500 (issues logged); in `'log'` mode it goes out with the status text as its `message` and a warning is logged. A string or bytes sent with a JSON content type (pre-serialized JSON, e.g. `JSON.stringify(errorBody(...))`) is parsed and treated exactly like the object; other text, or JSON text that doesn't parse, under an error status is replaced with the standard JSON body: a 4xx keeps the text as its `message`, a 5xx is masked and its text logged. A stream, a web `Response` whose own status is an error, or no body gets the standard body with the status text; the stream or the `Response` body is cancelled unread. This applies to every entry, JSON or not. Your root `onSend` hooks run before the scope's, so one that transforms payloads (`@fastify/compress`, say) sees the unreplaced body; register such plugins inside your own non-catalog scope.
- **Core's codes:** `FST_ERR_VALIDATION` (Fastify's, invalid request), `JEEVES_RESPONSE_VALIDATION` (response mismatch), `JEEVES_CONFIG_INVALID` (`/config/apply` patch fails the config schema; the issues are in `message`), `JEEVES_CONFIG_QUERY_INVALID` (`/config` JSONPath invalid).

## 6. Client

```ts
import { createCatalogClient } from '@karmaniverous/jeeves/catalog';

const client = createCatalogClient(catalog, {
  baseUrl: 'http://127.0.0.1:1936',
  auth: { bearer: () => process.env.ACME_API_KEY },
});

const { hits } = await client.search({ query: 'invoices', limit: 5 });
```

One method per entry, taking the merged `params`/`query`/`body` input (optional when no field is required) and returning the parsed response. A `z.looseObject` body also sends input fields no slot names; a `z.strictObject` body rejects them before sending. Credentials attach only to entries whose `auth` lists a scheme of the same kind; a lazy secret returning `undefined` attaches nothing. Failures throw `CatalogClientError`: `status` 0 with `issues` for invalid input, the HTTP status, parsed error `body` and its `code` for non-2xx (the error's `message` is the body's `message`, or its `error` when that is empty; a body that isn't Fastify's is kept as `message`), `status` 0 with `cause` for network errors, timeouts (including while the body is arriving), malformed JSON and a failing credential resolver. An error built from a response (non-2xx, or a 2xx body that fails its schema) also carries the response `headers` and `retryAfterMs`, parsed from `Retry-After` (seconds or an HTTP date; absent when missing or unparseable), so an SDK can back off on a 429 or 503. It isn't capped: cap it before passing it to `setTimeout`, which fires delays above about 24.8 days after 1 ms.

## 7. Plugin tools in `openclaw`

```ts
import { createPluginToolset } from '@karmaniverous/jeeves';

const tools = createPluginToolset(descriptor, {
  apiUrl: () => resolveApiUrl(api),
  catalog,
  tools: {
    search: { catalogMode: 'direct-only' },
    listTags: true,
  },
  auth: { bearer: () => readApiKey(api) },
  api,
});
```

- The standard tools (`acme_status`, `acme_config`, `acme_config_apply`, `acme_service`) are built from the catalog's standard entries, keep their 0.7.0 names, descriptions and results, and gain `replace` on `config_apply`.
- `tools` selects catalog entries to expose, in catalog order; unselected entries get no tool. Per entry you can override the `description`, rename fields with `inputAliases` (`{ '*': 'path' }`) and set `catalogMode: 'direct-only'` to keep a tool visible to the model when OpenClaw's Tool Search defers other tools.
- `auth` is attached as in the client. Without a `catalog`, no credentials are sent, as in 0.7.0.
- With `api`, the descriptor's `customPluginTools(api)` are appended. Duplicate tool names throw.

Parameters are generated from the schemas, so they include keywords such as `additionalProperties: false`; the model can't pass parameters a route doesn't accept.

## Checklist

- [ ] One `zod` in `npm ls zod`.
- [ ] Catalog in `core` with `standardEntries`; your own `status`/`config`/`configApply` entries removed.
- [ ] `promptRules` and `skill` exported from `core` and on the descriptor; the plugin build writes `SKILL.md`.
- [ ] `openapi.json` committed; build script writes it; drift test passes.
- [ ] Auth hook before `registerCatalogRoutes`, exempting `/openapi.json`; 401 tests per protected entry.
- [ ] Every response schema names every field or is loose; responses tested; `responseValidation: 'strict'`.
- [ ] Plugin tools from the catalog; tool names and results checked against the previous release.
