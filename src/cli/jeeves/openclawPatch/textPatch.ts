/**
 * Pure primitives for anchored, idempotent text patches against bundled
 * OpenClaw dist chunks. No filesystem access: callers feed file contents
 * in and get a decision (patch / already patched / not found / ambiguous)
 * back, plus before/after snippets for dry-run previews.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/lib/text-patch.ts`
 * (jeeves-core 0.7.0, #121).
 *
 * @module
 */

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
  | { status: 'already-patched'; line: number; snippet: string }
  | { status: 'not-found' }
  | { status: 'ambiguous'; detail: string };

/** A patch evaluated against a named file. */
export interface FilePatchResult {
  file: string;
  result: TextPatchResult;
}

/** Aggregated decision for one patch across every scanned dist file. */
export type DistPatchPlan =
  | {
      status: 'patch';
      file: string;
      result: Extract<TextPatchResult, { status: 'patch' }>;
    }
  | {
      status: 'already-patched';
      file: string;
      result: Extract<TextPatchResult, { status: 'already-patched' }>;
    }
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
 * Evaluate a single-site patch: exactly one `unpatched` match gets
 * rewritten by `rewrite`; exactly one `patched` match means done.
 * Zero of both is not-found; more than one of either (or one of each)
 * is ambiguous.
 */
export function evaluateAnchoredPatch(
  content: string,
  unpatched: RegExp,
  patched: RegExp,
  rewrite: (match: string) => string,
): TextPatchResult {
  const todo = allMatches(content, unpatched);
  const done = allMatches(content, patched);

  if (todo.length === 0 && done.length === 0) return { status: 'not-found' };

  if (todo.length + done.length > 1) {
    return {
      status: 'ambiguous',
      detail: `${String(todo.length)} unpatched + ${String(done.length)} patched matches (expected exactly 1)`,
    };
  }

  if (done.length === 1) {
    const [m] = done;
    return {
      status: 'already-patched',
      line: lineOf(content, m.index),
      snippet: m[0],
    };
  }

  const [m] = todo;
  const before = m[0];
  const after = rewrite(before);
  return {
    status: 'patch',
    content:
      content.slice(0, m.index) +
      after +
      content.slice(m.index + before.length),
    line: lineOf(content, m.index),
    before,
    after,
  };
}

/**
 * Reduce per-file results for one patch to a single decision. Exactly one
 * file may carry the patch site; zero sites is `not-found` (e.g. an
 * unknown OpenClaw version shape); anything else is an error so we never
 * patch the wrong chunk or half-patch a layout we don't understand.
 */
export function planAcrossFiles(results: FilePatchResult[]): DistPatchPlan {
  const errors: string[] = [];
  const hits: DistPatchPlan[] = [];

  for (const { file, result } of results) {
    switch (result.status) {
      case 'ambiguous':
        errors.push(`${file}: ${result.detail}`);
        break;
      case 'patch':
        hits.push({ status: 'patch', file, result });
        break;
      case 'already-patched':
        hits.push({ status: 'already-patched', file, result });
        break;
      case 'not-found':
        break;
    }
  }

  if (errors.length > 0) return { status: 'error', message: errors.join('; ') };

  if (hits.length === 0) {
    return { status: 'not-found', message: 'patch site not found in any file' };
  }

  if (hits.length > 1) {
    const files = hits.map((h) =>
      h.status === 'not-found' || h.status === 'error' ? '' : h.file,
    );
    return {
      status: 'error',
      message: `patch site found in ${String(hits.length)} files (expected 1): ${files.join(', ')}`,
    };
  }

  return hits[0];
}
