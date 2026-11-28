/**
 * Replies for entries whose declared `contentType` is a media range
 * (spec 0.12.0 §5.2 Wildcard replies).
 *
 * @module
 */

import type { FastifyReply } from 'fastify';

import { SERVER_ERROR_MESSAGE } from '../api/errorBody.js';
import { isMediaRange, mediaTypeOf } from '../catalog/schemaHelpers.js';
import type { CatalogEntry } from '../catalog/types.js';
import { errorReplyBody } from './errorReply.js';
import type { CatalogRouteLogger, HandlerResult } from './types.js';

/**
 * Whether `actual` is a concrete type matching the media range `range`
 * (same type, case-insensitively, and a non-empty, non-range subtype).
 *
 * @param range - The declared media range (e.g. `image/*`).
 * @param actual - A reply's `content-type`.
 * @returns `true` when `actual` matches.
 */
function matchesRange(range: string, actual: string): boolean {
  const want = mediaTypeOf(range);
  const got = mediaTypeOf(actual);
  return got.subtype !== '' && got.subtype !== '*' && got.type === want.type;
}

/**
 * A result header, read case-insensitively.
 *
 * @param headers - Result headers.
 * @param name - Lower-case header name.
 * @returns Its value, if set.
 */
function headerValue(
  headers: HandlerResult<CatalogEntry>['headers'],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

/**
 * For a range entry, check a 2xx result names a concrete, matching
 * `content-type`; if it doesn't, answer the handler fault as a logged 500 in
 * core's error body (never the literal declared range).
 *
 * @param entry - Catalog entry.
 * @param result - Handler result.
 * @param reply - Fastify reply.
 * @param log - Where a fault is logged.
 * @returns The sent 500 for a fault; `undefined` when the result may go out.
 */
export function sendWildcardFault(
  entry: CatalogEntry,
  result: HandlerResult<CatalogEntry>,
  reply: FastifyReply,
  log: Pick<CatalogRouteLogger, 'error'>,
): FastifyReply | undefined {
  if (
    result.status >= 400 ||
    entry.contentType === undefined ||
    !isMediaRange(entry.contentType)
  )
    return undefined;
  const actual = headerValue(result.headers, 'content-type');
  if (actual && matchesRange(entry.contentType, actual)) return undefined;
  const body = errorReplyBody(500, SERVER_ERROR_MESSAGE, undefined, log, {
    deliberate: false,
    cause: {
      details: {
        entry: entry.name,
        declaredContentType: entry.contentType,
        actualContentType: actual,
      },
      message:
        'Handler fault: a 2xx reply for a wildcard contentType entry did not set a concrete, matching content-type header',
    },
  });
  return reply.status(500).send(body);
}
