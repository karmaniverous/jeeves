---
title: Migrating to 0.10.0
---

# Migrating to 0.10.0

0.10.0 makes every non-2xx response from a catalog app Fastify's standard error body (#164):

```json
{
  "statusCode": 409,
  "code": "RUNNER_JOB_EXISTS",
  "error": "Conflict",
  "message": "Job j1 already exists"
}
```

`statusCode` is the HTTP status, `code` a machine-readable code (present on Fastify's errors and on every deliberate error made with a code; clients must tolerate its absence), `error` the standard status text and `message` a human-readable message, generic on every 5xx. Nothing else is ever sent. Clients branch on `code`, never on `message`. See [Errors](./endpoint-catalog.md#errors) in the catalog guide.

Every change below is breaking for a service or client that reads core's 0.9 error bodies.

## Since the #167 change: errors are trusted by definition (`defineError`)

0.10.0 replaced the `message` of **every** 5xx with `SERVER_ERROR_MESSAGE` and kept whatever status, `code` and `headers` a thrown error carried. Since the #167 change (the release after 0.10.0), a thrown error is trusted only when its class says so: **define every error the caller should see with `defineError`**, exported from `/fastify`. Wherever the 0.10.0 notes below describe how a thrown error's status, `code`, `message` or `headers` are used, read this rule instead.

```ts
import { defineError } from '@karmaniverous/jeeves/fastify';

const ScanInProgress = defineError(
  'WATCHER_SCAN_IN_PROGRESS',
  'A scan is in progress; retry when it finishes',
  503,
);
throw Object.assign(new ScanInProgress(), { headers: { 'retry-after': '30' } });
```

`defineError(code, message, status, options?)` wraps `@fastify/error`'s `createError` (same message template and class) and brands the class with a `Symbol.for` key, so the brand holds across two copies of core. Core can't tell a library's error from a deliberate one by its properties (undici, Elasticsearch, the AWS SDK and `@fastify/error`-based plugins all set their own `statusCode` and `code`, and their messages and headers carry upstream detail), so trust is declared where the error is defined.

| Thrown | 0.10.0 | Now |
| --- | --- | --- |
| An error your service defines for the caller, 4xx (now with `defineError`; 0.10.0: `createError`) | status, code, message, all its headers | status, code, message; headers `Retry-After`, `WWW-Authenticate`, `Allow` only |
| An error your service defines for the caller, 5xx (now with `defineError`; 0.10.0: `createError`) | status, code kept; message masked; all its headers | status, code, message; allowlisted headers only |
| Fastify's own 4xx (`FST_ERR_VALIDATION`, `FST_ERR_CTP_INVALID_JSON_BODY`, `FST_ERR_CTP_BODY_TOO_LARGE`, `FST_ERR_CTP_INVALID_MEDIA_TYPE`, ...; any 4xx whose `code` begins `FST_ERR_`, by Fastify's naming convention) | kept | unchanged |
| Fastify's own 5xx (`FST_ERR_*` with a 5xx status) | status, code kept; message masked | 500, masked, no code |
| Plain `createError` error (any status, including 4xx) | its status and code; 4xx message kept | **500, masked, no code, no headers** |
| `http-errors` error (any status, any `expose`) | its status; 4xx message kept | **500, masked, no code, no headers** |
| Error with only a `status` (axios, Qdrant's `ApiError`) | its status and code (a 5xx's too); 4xx message kept | **500, masked, no code, no headers** |
| A Fastify plugin's own error (`@fastify/rate-limit` 429/403, `@fastify/static` 403/412/416, `@fastify/multipart` 413, `@fastify/jwt` 401, `@fastify/sensible` `httpErrors`) | its status and code; 4xx message kept | **500, masked, no code, no headers** (headers the plugin set on the reply stay); map it, see below |
| undici `ResponseStatusCodeError` and other library errors with their own `statusCode` | status, code; upstream `headers` (`set-cookie` included) forwarded | **500, masked, no code, no headers** |
| Plain `Error`, a crash such as `ENOENT` | 500, masked, no code | unchanged (and none of its headers) |

Unchanged: a handler error result (`{ status, body: { message, code? }, headers? }`) and an `errorBody(...)` a hook sends keep their status, `code` and `message`, a 5xx's message included (0.10.0 masked it), and an error result's `headers` are applied. Headers already on the reply (set by a hook, say) are never filtered. Raw text, a stream, a web `Response` or no body under a 5xx, and the strict response mismatch (`JEEVES_RESPONSE_VALIDATION`), are masked as before. `registerErrorHandlers` follows the same rule as catalog routes, so it applies to every plugin's errors on the app.

Also fixed in the #167 change: when one of your hooks (`onSend`, `preSerialization`) throws again while an error reply is being sent, Fastify serializes that hook's error itself. 0.10.0 sent its `message` and `code` as written on a catalog route (and logged `Error reply masked`); now the catalog routes' error serializer sends the masked standard body for the status (a 4xx its status text, a 5xx `SERVER_ERROR_MESSAGE`, no `code`) and logs the error as `Error reply masked (a hook failed while it was sent)`. Only the body is masked: before the fallback, Fastify's own default error handler applies the hook error's status and `headers` to the reply, and they go out as they are, on catalog routes too. Routes covered only by `registerErrorHandlers` can't be protected from this Fastify fallback at all. Hooks must not throw errors carrying headers or internal statuses.

What to do:

- **Services: move every deliberate error to `defineError`.** Replace `createError(...)` with `defineError(...)` (same arguments; the status must be an error status, 400 to 599) for every error a caller should see, 4xx as well as 5xx. A `createError` or `http-errors` error you forget is now a codeless 500: a client branching on `RUNNER_JOB_EXISTS` gets `500` with no `code`. Search for `createError`, `httpErrors`, `new HttpError` and thrown objects with a `statusCode` before upgrading.
- **Services: write the message for the caller.** A `defineError` error's `message` is sent on a 5xx too ("A scan is in progress; retry when it finishes"); keep hosts, paths and driver errors out of its `%s` arguments.
- **Services: catch library errors at the boundary.** An upstream 404 or 503 from undici, axios or Qdrant is no longer forwarded with its status: it becomes a masked 500. Map the ones a caller should see to a `defineError` error (`NOT_FOUND`, `UPSTREAM_UNAVAILABLE`, ...).
- **Services: map Fastify plugins' errors.** A plugin's hook runs before your handler, so you can't catch its error at the service boundary, and its plain status-bearing error (`@fastify/rate-limit`, `@fastify/static`, `@fastify/multipart`, `@fastify/jwt`, `@fastify/sensible`) is now an error-logged 500: a rate-limited client loses its 429 (and `CatalogClientError.retryAfterMs`). Map them where the plugin lets you. For rate-limit, return a `defineError` instance from `errorResponseBuilder`; the plugin throws it as is, and the `Retry-After` it set on the reply stays:

  ```ts
  const RateLimited = defineError(
    'RATE_LIMITED',
    'Rate limit exceeded, retry in %s',
    429,
  );
  const Banned = defineError(
    'RATE_LIMIT_BANNED',
    'Too many requests; access is suspended',
    403,
  );

  await app.register(rateLimit, {
    errorResponseBuilder: (_request, context) =>
      context.ban ? new Banned() : new RateLimited(context.after),
  });
  ```

  For the others, wrap the call that throws (a `preHandler` that calls `request.jwtVerify()` and rethrows a `defineError` 401, say) or send an `errorBody(...)` from your own hook.

- **Services: headers.** Only `Retry-After`, `WWW-Authenticate` and `Allow` on a `defineError` error reach the client. Anything else (a custom `x-*` header, `set-cookie`) must go on an error result's `headers` or be set on the reply.
- **Clients:** `CatalogClientError.message` is now the service's own text for a deliberate 5xx instead of `SERVER_ERROR_MESSAGE`. Errors a service hasn't moved to `defineError` arrive as `500` with no `code`. Keep branching on `code`.
- **Logs:** every 5xx is still logged at `error`. A thrown error is logged with `{ err }` as `Error reply` when its message is sent and `Error reply masked` when it is not (0.10.0 logged both as `Request failed`). A handler result's or hook's 5xx is logged with `{ statusCode, code, message }`, also as `Error reply` or `Error reply masked` (0.10.0 logged every one as `Error reply masked`).
- **Core's config apply 500s** (unreadable config file, failed write) are handler results, so their message is now sent. It is caller-facing, with a code of its own; the config file path and the OS error go to the server log only (spec 5d.2):

  | Failure | `code` | `message` |
  | --- | --- | --- |
  | The existing config file can't be read, or isn't a JSON object (left untouched) | `JEEVES_CONFIG_READ_FAILED` | `The config file could not be read.` |
  | The merged config can't be written (the file is unchanged) | `JEEVES_CONFIG_WRITE_FAILED` | `The config file could not be written.` |

  0.10.0 sent no code and masked the message, which named the file and the OS error (`Could not read config file <path>: <error>`, `Failed to write config: <error>`). Both codes are exported from the root. The handler logs `{ path, err }` with `Config apply: the config file could not be read` (or `written`).

- **Core's config apply warning:** when the component's `onConfigApply` throws, the file has been written, so the reply stays `200 { applied: true, warning, config }`. `warning` is now `The config was written but could not be applied.`; 0.10.0 sent `Config written but callback failed: <error>`, the callback's raw error text. The handler logs `{ path, err }` with `Config apply: the config was written but could not be applied`. A client that read the error out of `warning` must read the server log instead.
- **Core's status health error:** when the component's health check (`getHealth`) throws, the reply stays `200` with `status: 'degraded'`, but `health` is now `{ error: 'The health check failed.' }`; 0.10.0 sent the raw error text there, and status routes are often unauthenticated (spec 5d.3). The handler logs `{ err }` with `Status: the <name> health check failed`.
- **Where those logs go:** both handlers log to the `logger` they are called with, a `HandlerLogger` (pino-style `error(details, message)`, exported from the root). `standardHandlers(sources, { logger })` passes its `logger` option, else the request's Fastify logger. **If your app runs Fastify with `logger: false`** (and passes `logger` to `registerCatalogRoutes`), pass the same `logger` to `standardHandlers`, or these errors are silently dropped. Called directly, `createConfigApplyHandler(...)(request, logger?)` and `createStatusHandler(...)(logger?)` take the logger as an optional argument and log to `console.error` without one.

## Services (`/fastify`)

- **The catalog scope answers every error itself**, in Fastify's body. 0.9 passed errors a handler threw to your app's error handler and sent its reply unchanged; that handler is **no longer consulted for catalog routes**, and there is no option to restore it. 4xx errors keep their `message` and `code`; 5xx errors keep their `code` only when they declare their status (a `createError` error does; a crash such as `ENOENT` is a 500 without a `code`), get the generic `message` (`SERVER_ERROR_MESSAGE`) and are logged through `logger` (or Fastify's logger). As in Fastify, the status is the error's `statusCode`, or its `status` when it has none, and the error's `headers` (for example `Retry-After` on a 429 or 503) are applied, except body headers (`content-type`, `content-encoding`, `content-length`, `transfer-encoding`) and names or values Node would reject, which are skipped. A status set on the reply before a throw is ignored: put it on the error. Throw deliberate errors made with `defineError` (exported from `/fastify`; 0.10.0 itself used `@fastify/error`'s `createError`, which the #167 change no longer trusts), with an upper-case code:

  ```ts
  import { defineError } from '@karmaniverous/jeeves/fastify';

  const JobExists = defineError(
    'RUNNER_JOB_EXISTS',
    'Job %s already exists',
    409,
  );
  throw new JobExists(id);
  ```

  This also fixes a 0.9 bug: an error that reached Fastify's own handling lost its `statusCode` and `message` and leaked the error's enumerable fields.

- **Request-validation 400 is Fastify's own:** `{ statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request', message: 'body/name Too small: expected string to have >=1 characters' }` (failures joined with `, `). It was `{ error: 'Request validation failed', issues }`. Field-level detail stays with SDK and tool callers, which validate input before sending.

- **`formatValidationError` and `CatalogValidationIssue` are removed.** A service that passed `formatValidationError` drops it; there is no replacement.

- **The strict response-mismatch 500** is `{ statusCode: 500, code: 'JEEVES_RESPONSE_VALIDATION', error: 'Internal Server Error', message: SERVER_ERROR_MESSAGE }`; the Zod issues are logged only. It was `{ code: 'internal_error', error: 'Response validation failed' }`.

- **Handler error results are `{ message, code? }`.** A handler returns `{ status: 404, body: { message: 'No job j1', code: 'RUNNER_JOB_NOT_FOUND' } }`; route registration adds `statusCode` and `error` from the status (`HandlerErrorBody`). A 5xx result's `message` is logged and replaced with the generic one. 0.9's `{ error: '...' }` bodies no longer type-check.

- **Replies your own hooks send for catalog routes are rebuilt from the reply status**, JSON entries or not: `statusCode` and `error` from the status, a string `code` kept, other fields dropped, and a 5xx's `message` replaced with the generic one and logged (in `'log'` mode too). A body without a string `message` (for example an auth hook's 0.9-style `{ error: 'Unauthorized' }`) is **not** repaired: in `'strict'` mode it becomes the mismatch 500; in `'log'` mode it goes out with the status text as its `message` and a warning. Pre-serialized JSON text (a string or bytes with a JSON content type) is parsed and treated like the object. Other text, a stream, a web `Response` with an error status, or no body becomes the standard JSON body (a 4xx keeps text as its `message`; a 5xx is masked). Routes outside the catalog scope are not touched. Send `errorBody(401, 'Unauthorized')`, or throw a `defineError` error from the hook (0.10.0: a `createError` error): the catalog scope answers it. Check your auth hooks before switching to `'strict'`.

- **`'log'` mode** still sends a mismatched 2xx body unparsed, but error bodies are always rebuilt as above.

- **5xx log lines:** a handler result's or hook's 5xx is logged at `error` as `Error reply masked` with `{ statusCode, code, message }` (since the #167 change, `Error reply` when its message is kept); a thrown error as `Request failed` with `{ err }` (since the #167 change, `Error reply` or `Error reply masked`). 4xx errors are not logged.

- **New:** `registerErrorHandlers(app, { logger? })` gives the app's other routes the same handling (Fastify's body, 5xx masked and logged). `errorBody(statusCode, message, code?)`, `SERVER_ERROR_MESSAGE` and `JEEVES_RESPONSE_VALIDATION` are exported from the root and `/fastify`.

## Core handlers (root)

- **`createConfigApplyHandler`'s 400** is `{ statusCode: 400, code: 'JEEVES_CONFIG_INVALID', error: 'Bad Request', message: 'Config validation failed: a.b: Invalid input: expected number, received string; c: ...' }`, the Zod issues folded into `message`. It was `{ error: 'Config validation failed', issues }`. Its 500s (unreadable file, failed write) are Fastify's body too; through a catalog route their message was masked in 0.10.0; since the #167 change it is sent, caller-facing, with the codes `JEEVES_CONFIG_READ_FAILED` and `JEEVES_CONFIG_WRITE_FAILED` (see above).
- **`createConfigQueryHandler`'s 400** for an invalid JSONPath is `{ statusCode: 400, code: 'JEEVES_CONFIG_QUERY_INVALID', error: 'Bad Request', message }`. It was `{ error }`.
- The codes are exported as `JEEVES_CONFIG_INVALID` and `JEEVES_CONFIG_QUERY_INVALID`.

## Clients (`/catalog`)

- **`errorBodySchema` is Fastify's body** (`statusCode`, optional `code`, `error`, `message`; other fields dropped). It was `{ error }` plus any extra fields.
- **`CatalogClientError` has `code`** (the body's `code`), and its `message` is the body's `message`, falling back to `error` when empty. It was `"<entry> failed with HTTP <status>"`. `status`, `body`, `issues`, `headers` and `retryAfterMs` are unchanged.
- **A non-2xx body that isn't Fastify's** (a proxy's HTML page, say) becomes `{ statusCode: <status>, error: 'HTTP <status>', message: <the body text> }`. It was `{ error: <the body text> }`.
