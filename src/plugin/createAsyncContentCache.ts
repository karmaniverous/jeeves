/**
 * Creates a synchronous content accessor backed by an async data source.
 *
 * @remarks
 * Returns a sync `() => string` that serves the last successfully fetched
 * value while kicking off a background refresh on each call (at most one in
 * flight). Useful for dynamic prompt context (see {@link registerPromptContext})
 * that should not add a network round-trip to every prompt build.
 *
 * First call returns `placeholder`. If a refresh fails, the previous good
 * value is retained. Starts no timers: refreshes happen only when called.
 *
 * @example
 * ```typescript
 * const getRules = createAsyncContentCache({
 *   fetch: async () => renderRules(await fetchJson(`${apiUrl}/status`)),
 *   placeholder: STATIC_RULES,
 * });
 *
 * registerPromptContext(api, { content: getRules });
 * ```
 */

import { getErrorMessage, isTransientError } from '../utils.js';

/** Options for {@link createAsyncContentCache}. */
export interface AsyncContentCacheOptions {
  /**
   * Async function that fetches fresh content.
   * Errors are caught and logged; the previous value is retained.
   */
  fetch: () => Promise<string>;

  /**
   * Content returned before the first successful fetch.
   *
   * @defaultValue `'> Initializing...'`
   */
  placeholder?: string;

  /**
   * Optional error handler. Called when `fetch` throws.
   * Defaults to a handler that logs transient network errors as
   * concise warnings and unexpected errors with full details.
   */
  onError?: (error: unknown) => void;
}

/**
 * Creates a synchronous content accessor backed by an async data source.
 *
 * @param options - Cache configuration.
 * @returns A sync `() => string` accessor.
 */
export function createAsyncContentCache(
  options: AsyncContentCacheOptions,
): () => string {
  const {
    fetch: fetchContent,
    placeholder = '> Initializing...',
    onError = (err: unknown) => {
      if (isTransientError(err)) {
        console.warn(
          `[jeeves] cache refresh: transient error (${getErrorMessage(err)})`,
        );
      } else {
        console.warn('[jeeves] cache refresh failed:', err);
      }
    },
  } = options;

  let cached: string = placeholder;
  let refreshing = false;

  return () => {
    if (!refreshing) {
      refreshing = true;
      fetchContent()
        .then((content) => {
          cached = content;
        })
        .catch(onError)
        .finally(() => {
          refreshing = false;
        });
    }
    return cached;
  };
}
