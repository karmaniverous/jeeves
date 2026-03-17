/**
 * Similarity-based cleanup detection for orphaned managed content.
 *
 * @remarks
 * Uses Jaccard similarity on 3-word shingles (Decision 22) to detect
 * when orphaned managed content exists in the user content zone.
 */

/** Default similarity threshold for cleanup detection. */
const DEFAULT_THRESHOLD = 0.15;

/**
 * Generate a set of n-word shingles from text.
 *
 * @param text - Input text.
 * @param n - Shingle size (default 3).
 * @returns Set of n-word shingles.
 */
export function shingles(text: string, n = 3): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    set.add(words.slice(i, i + n).join(' '));
  }
  return set;
}

/**
 * Compute Jaccard similarity between two sets.
 *
 * @param a - First set.
 * @param b - Second set.
 * @returns Jaccard similarity coefficient (0 to 1).
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Check whether user content contains orphaned managed content.
 *
 * @param managedContent - The current managed block content.
 * @param userContent - Content below the END marker.
 * @param threshold - Jaccard threshold (default 0.15).
 * @returns `true` if cleanup is needed.
 */
export function needsCleanup(
  managedContent: string,
  userContent: string,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  if (!userContent.trim()) return false;
  return jaccard(shingles(managedContent), shingles(userContent)) > threshold;
}
