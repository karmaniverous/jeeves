/**
 * HTTP helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Thin wrappers around `fetch` that throw on non-OK responses
 * and handle JSON serialisation/deserialisation. The JSON helpers abort
 * after {@link DEFAULT_FETCH_TIMEOUT_MS} unless the caller passes its own
 * `signal` or a `timeoutMs` override, so a service that accepts the
 * connection but never answers cannot hang a plugin tool call.
 */

/**
 * Default timeout for {@link fetchJson} and {@link postJson}, in
 * milliseconds (2 minutes): long enough for the slowest existing caller
 * (jeeves-server export, OAuth and meta synthesis calls), short enough
 * that a stalled service cannot hold a call open indefinitely.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 120_000;

/** Options for {@link fetchJson} and {@link postJson}. */
export interface FetchJsonOptions {
  /**
   * Abort after this many milliseconds (default
   * {@link DEFAULT_FETCH_TIMEOUT_MS}). Ignored when `init.signal` is set:
   * a caller-supplied signal always wins.
   */
  timeoutMs?: number;
}

/**
 * Fetch a URL with an automatic abort timeout.
 *
 * @param url - URL to fetch.
 * @param timeoutMs - Timeout in milliseconds before aborting.
 * @param init - Optional `fetch` init options.
 * @returns The fetch Response object.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch JSON from a URL, throwing on non-OK responses.
 *
 * @param url - URL to fetch.
 * @param init - Optional `fetch` init options. A `signal` here is used
 *   as-is and replaces the default timeout.
 * @param options - Per-call options (`timeoutMs`).
 * @returns Parsed JSON response body.
 * @throws Error with `HTTP {status}: {body}` message on non-OK responses.
 * @throws The abort error when the timeout (or the caller's signal) fires.
 */
export async function fetchJson(
  url: string,
  init?: RequestInit,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  const signal =
    init?.signal ??
    AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) {
    throw new Error('HTTP ' + String(res.status) + ': ' + (await res.text()));
  }
  return res.json();
}

/**
 * POST JSON to a URL and return parsed response.
 *
 * @param url - URL to POST to.
 * @param body - Request body (will be JSON-stringified).
 * @param options - Per-call options (`timeoutMs`).
 * @returns Parsed JSON response body.
 */
export async function postJson(
  url: string,
  body: unknown,
  options: FetchJsonOptions = {},
): Promise<unknown> {
  return fetchJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    options,
  );
}
