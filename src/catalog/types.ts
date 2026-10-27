/**
 * Endpoint catalog types (spec 5.2).
 *
 * @module
 */

import type { z } from 'zod';

/**
 * What an endpoint does to service state. Plugin and MCP tools derive their
 * hints from it: `read` is read-only, `destructive` may destroy data, `write`
 * is neither.
 */
export type EntryKind = 'read' | 'write' | 'destructive';

/** One way a caller can present a credential. */
export type AuthScheme =
  | {
      /** `Authorization: Bearer <key>`. */
      readonly in: 'bearer';
    }
  | {
      /** A request header carrying the key. */
      readonly in: 'header';
      /** Header name. */
      readonly name: string;
    }
  | {
      /** A query parameter carrying the key. */
      readonly in: 'query';
      /** Parameter name. */
      readonly name: string;
    }
  | {
      /** A cookie carrying a session or key. */
      readonly in: 'cookie';
      /** Cookie name. */
      readonly name: string;
    };

/**
 * Who may call an entry. Descriptive only: core uses it for the client,
 * OpenAPI and tool definitions, and never enforces it; each component's own
 * middleware enforces it (spec Decision 80).
 *
 * @remarks
 * `'none'` is an open route. Otherwise any one of `schemes` is accepted, and
 * `insiderOnly` marks routes restricted to insiders (jeeves-server).
 */
export type AuthSpec =
  | 'none'
  | {
      /** Accepted credential schemes; any one suffices. */
      readonly schemes: readonly AuthScheme[];
      /** Restricted to insiders (jeeves-server). */
      readonly insiderOnly?: boolean;
    };

/** One endpoint in a service's catalog. */
export interface CatalogEntry {
  /** Unique camelCase name; the OpenAPI `operationId`. */
  readonly name: string;
  /** HTTP method. */
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Route path in Fastify syntax (`:param` segments, `*` wildcard). */
  readonly path: string;
  /** What the endpoint does; used for OpenAPI and tool descriptions. */
  readonly description: string;
  /** Path parameters; keys equal the path's `:param` names. */
  readonly params?: z.ZodObject<z.core.$ZodLooseShape, z.core.$ZodObjectConfig>;
  /** Query parameters; each field must accept string input (rule 6). */
  readonly query?: z.ZodObject<z.core.$ZodLooseShape, z.core.$ZodObjectConfig>;
  /** JSON request body. */
  readonly body?: z.ZodObject<z.core.$ZodLooseShape, z.core.$ZodObjectConfig>;
  /**
   * Successful (2xx) response. For non-JSON entries, `z.instanceof(Uint8Array)`
   * or `z.string()`.
   */
  readonly response: z.ZodType;
  /** Who may call it. */
  readonly auth: AuthSpec;
  /** What it does to service state. */
  readonly kind: EntryKind;
  /** Response content type; default `application/json`. */
  readonly contentType?: string;
}

/**
 * A validated, frozen endpoint catalog. Keeps each entry's literal `name` and
 * schema types, so handlers and clients are keyed and typed by entry name.
 */
export interface Catalog<
  E extends readonly CatalogEntry[] = readonly CatalogEntry[],
> {
  /** The entries, in definition order. */
  readonly entries: E;
  /**
   * Look up an entry by name.
   *
   * @param name - Entry name.
   * @returns The entry (typed by its literal name when names are literal).
   * @throws Error when no entry has that name.
   */
  byName<N extends E[number]['name']>(
    name: N,
  ): [
    Extract<
      E[number],
      {
        /** Entry name. */
        name: N;
      }
    >,
  ] extends [never]
    ? E[number]
    : Extract<
        E[number],
        {
          /** Entry name. */
          name: N;
        }
      >;
}

/**
 * Whether an entry responds with JSON: no `contentType`, or one containing
 * `json` (the type-level counterpart of the runtime JSON check).
 */
export type IsJsonEntry<E extends CatalogEntry> =
  E['contentType'] extends string
    ? E['contentType'] extends `${string}json${string}`
      ? true
      : false
    : true;
