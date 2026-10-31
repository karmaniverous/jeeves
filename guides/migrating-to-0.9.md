---
title: Migrating to 0.9.0
---

# Migrating to 0.9.0

0.9.0 makes the endpoint catalog light to install for clients. It changes only the `/fastify` and `/openapi` entry points; the root and `/catalog` are unchanged.

## Changed

- **`fastify` and `zod-openapi` are optional peers** (they were dependencies in 0.8.0). Add them where you use the entry point that needs them:

  | Entry point | Add |
  | --- | --- |
  | `@karmaniverous/jeeves`, `/catalog` | nothing |
  | `/openapi` | `zod-openapi` `^6` (usually a dev dependency of the package that writes `openapi.json`) |
  | `/fastify` | `fastify` `^5` (your service already has it for its app) |

  A component SDK built on `createCatalogClient` no longer installs Fastify or the OpenAPI library.

- **`fastify-type-provider-zod` is gone.** `registerCatalogRoutes` validates requests itself. Request-validation 400 bodies are unchanged (`{ error, issues }`, each issue `{ slot, path, code, message, params }`), as is `formatValidationError`. A service that imported `fastify-type-provider-zod` only for the catalog can drop it.

- **The strict response-validation 500 has a `code`:** `{ code: 'internal_error', error: 'Response validation failed' }` (#152), like every other error body a Jeeves service sends.
