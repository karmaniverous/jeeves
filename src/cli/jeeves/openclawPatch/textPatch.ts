/**
 * Pure primitives for anchored, idempotent text patches against bundled
 * OpenClaw dist chunks. No filesystem access: callers feed file contents
 * in and get a decision (patch / already patched / upstream-fixed / not
 * found / ambiguous) back, plus before/after snippets for dry-run
 * previews.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/lib/text-patch.ts`
 * (jeeves-core 0.7.0, #121).
 *
 * @module
 */

/** A patch site that needs no write: patched by us, or fixed upstream. */
interface SettledSite {
  /** 1-based line number of the site. */
  line: number;
  /** The site's text as found. */
  snippet: string;
}

/** Outcome of evaluating one patch against one file's content. */
export type TextPatchResult =
  | {
      status: 'patch';
      /** Full patched file content. */
      content: string;
      /** 1-based line number where the change starts. */
      line: number;
      /** Exact text that will be replaced. */
      before: string;
      /** Exact replacement text. */
      after: string;
    }
  | ({ status: 'already-patched' } & SettledSite)
  | ({ status: 'upstream-fixed' } & SettledSite)
  | { status: 'not-found' }
  | { status: 'ambiguous'; detail: string };

/** A patch evaluated against a named file. */
export interface FilePatchResult {
  file: string;
  result: TextPatchResult;
}

/** A per-file result that locates the patch site. */
export type SiteResult = Extract<
  TextPatchResult,
  { status: 'patch' | 'already-patched' | 'upstream-fixed' }
>;

/** Aggregated decision for one patch across every scanned dist file. */
export type DistPatchPlan =
  | { status: 'found'; file: string; result: SiteResult }
  | { status: 'not-found'; message: string }
  | { status: 'error'; message: string };

/** 1-based line number of a character offset. */
export function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Collect every match of a global regex. */
export function allMatches(content: string, re: RegExp): RegExpExecArray[] {
  if (!re.global) throw new Error(`Regex must be global: ${String(re)}`);
  return [...content.matchAll(re)];
}

/**
 * Reduce per-file results for one patch to a single decision. Exactly one
 * file may carry the patch site; zero sites is `not-found` (e.g. an
 * unknown OpenClaw version shape); anything else is an error so we never
 * patch the wrong chunk or half-patch a layout we don't understand.
 */
export function planAcrossFiles(results: FilePatchResult[]): DistPatchPlan {
  const errors: string[] = [];
  const hits: Array<{ file: string; result: SiteResult }> = [];

  for (const { file, result } of results) {
    if (result.status === 'ambiguous') {
      errors.push(`${file}: ${result.detail}`);
    } else if (result.status !== 'not-found') {
      hits.push({ file, result });
    }
  }

  if (errors.length > 0) return { status: 'error', message: errors.join('; ') };

  if (hits.length === 0) {
    return { status: 'not-found', message: 'patch site not found in any file' };
  }

  if (hits.length > 1) {
    return {
      status: 'error',
      message: `patch site found in ${String(hits.length)} files (expected 1): ${hits.map((h) => h.file).join(', ')}`,
    };
  }

  const [hit] = hits;
  return { status: 'found', ...hit };
}
