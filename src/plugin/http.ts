/**
 * HTTP helpers for the OpenClaw plugin SDK.
 *
 * @remarks
 * Thin wrappers around `fetch` that throw on non-OK responses
 * and handle JSON serialisation/deserialisation.
 */

/**
 * Fetch JSON from a URL, throwing on non-OK responses.
 *
 * @param url - URL to fetch.
 * @param init - Optional `fetch` init options.
 * @returns Parsed JSON response body.
 * @throws Error with `HTTP {status}: {body}` message on non-OK responses.
 */
export async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, init);
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
 * @returns Parsed JSON response body.
 */
export async function postJson(url: string, body: unknown): Promise<unknown> {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
