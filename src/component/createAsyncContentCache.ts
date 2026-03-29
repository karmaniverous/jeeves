/**
 * Creates a synchronous content accessor backed by an async data source.
 *
 * @remarks
 * Solves the sync/async gap in `JeevesComponentDescriptor.generateToolsContent()`:
 * the interface is synchronous, but most components fetch live data from
 * their HTTP service. This utility returns a sync `() => string` that
 * serves the last successfully fetched value while kicking off a background
 * refresh on each call.
 *
 * First call returns `placeholder`. Subsequent calls return the last
 * successfully fetched content. If a refresh fails, the previous good
 * value is retained.
 *
 * @example
 * ```typescript
 * const getContent = createAsyncContentCache({
 *   fetch: async () => {
 *     const res = await fetch('http://127.0.0.1:1936/status');
 *     return formatWatcherStatus(await res.json());
 *   },
 *   placeholder: '> Initializing watcher status...',
 * });
 *
 * const writer = createComponentWriter({
 *   // ...
 *   generateToolsContent: getContent,
 * });
 * ```
 */

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
   * Defaults to `console.warn`.
   */
  onError?: (error: unknown) => void;
}

/**
 * Creates a synchronous content accessor backed by an async data source.
 *
 * @param options - Cache configuration.
 * @returns A sync `() => string` suitable for `generateToolsContent`.
 */
export function createAsyncContentCache(
  options: AsyncContentCacheOptions,
): () => string {
  const {
    fetch: fetchContent,
    placeholder = '> Initializing...',
    onError = (err: unknown) => {
      console.warn('[jeeves] async content cache refresh failed:', err);
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
