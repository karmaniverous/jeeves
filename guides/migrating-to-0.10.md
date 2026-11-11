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

## Services (`/fastify`)

- **The catalog scope answers every error itself**, in Fastify's body. 0.9 passed errors a handler threw to your app's error handler and sent its reply unchanged; that handler is **no longer consulted for catalog routes**, and there is no option to restore it. 4xx errors keep their `message` and `code`; 5xx errors keep their `code` only when they declare their status (a `createError` error does; a crash such as `ENOENT` is a 500 without a `code`), get the generic `message` (`SERVER_ERROR_MESSAGE`) and are logged through `logger` (or Fastify's logger). As in Fastify, the status is the error's `statusCode`, or its `status` when it has none, and the error's `headers` (for example `Retry-After` on a 429 or 503) are applied, except body headers (`content-type`, `content-encoding`, `content-length`, `transfer-encoding`) and names or values Node would reject, which are skipped. A status set on the reply before a throw is ignored: put it on the error. Throw deliberate errors made with `@fastify/error`'s `createError`, with an upper-case code:

  ```ts
  import createError from '@fastify/error';

  const JobExists = createError(
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

- **Replies your own hooks send for catalog routes are rebuilt from the reply status**, JSON entries or not: `statusCode` and `error` from the status, a string `code` kept, other fields dropped, and a 5xx's `message` replaced with the generic one and logged (in `'log'` mode too). A body without a string `message` (for example an auth hook's 0.9-style `{ error: 'Unauthorized' }`) is **not** repaired: in `'strict'` mode it becomes the mismatch 500; in `'log'` mode it goes out with the status text as its `message` and a warning. Pre-serialized JSON text (a string or bytes with a JSON content type) is parsed and treated like the object. Other text, a stream, a web `Response` with an error status, or no body becomes the standard JSON body (a 4xx keeps text as its `message`; a 5xx is masked). Routes outside the catalog scope are not touched. Send `errorBody(401, 'Unauthorized')`, or throw a `createError` error from the hook: the catalog scope answers it. Check your auth hooks before switching to `'strict'`.

- **`'log'` mode** still sends a mismatched 2xx body unparsed, but error bodies are always rebuilt as above.

- **5xx log lines:** a handler result's or hook's 5xx is logged at `error` as `Error reply masked` with `{ statusCode, code, message }`; a thrown error as `Request failed` with `{ err }`. 4xx errors are not logged.

- **New:** `registerErrorHandlers(app, { logger? })` gives the app's other routes the same handling (Fastify's body, 5xx masked and logged). `errorBody(statusCode, message, code?)`, `SERVER_ERROR_MESSAGE` and `JEEVES_RESPONSE_VALIDATION` are exported from the root and `/fastify`.

## Core handlers (root)

- **`createConfigApplyHandler`'s 400** is `{ statusCode: 400, code: 'JEEVES_CONFIG_INVALID', error: 'Bad Request', message: 'Config validation failed: a.b: Invalid input: expected number, received string; c: ...' }`, the Zod issues folded into `message`. It was `{ error: 'Config validation failed', issues }`. Its 500s (unreadable file, failed write) are Fastify's body too; through a catalog route their message is masked.
- **`createConfigQueryHandler`'s 400** for an invalid JSONPath is `{ statusCode: 400, code: 'JEEVES_CONFIG_QUERY_INVALID', error: 'Bad Request', message }`. It was `{ error }`.
- The codes are exported as `JEEVES_CONFIG_INVALID` and `JEEVES_CONFIG_QUERY_INVALID`.

## Clients (`/catalog`)

- **`errorBodySchema` is Fastify's body** (`statusCode`, optional `code`, `error`, `message`; other fields dropped). It was `{ error }` plus any extra fields.
- **`CatalogClientError` has `code`** (the body's `code`), and its `message` is the body's `message`, falling back to `error` when empty. It was `"<entry> failed with HTTP <status>"`. `status`, `body`, `issues`, `headers` and `retryAfterMs` are unchanged.
- **A non-2xx body that isn't Fastify's** (a proxy's HTML page, say) becomes `{ statusCode: <status>, error: 'HTTP <status>', message: <the body text> }`. It was `{ error: <the body text> }`.
