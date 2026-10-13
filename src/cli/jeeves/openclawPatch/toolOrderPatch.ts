/**
 * Patch OpenClaw's `toolOrder` array to insert Jeeves component tools
 * (`watcher_search`, `watcher_scan`) above `grep`, so the model sees
 * semantic search tools before filesystem discovery tools.
 *
 * @remarks
 * Hoisted from `jeeves-scripts-template/src/admin/patch-tool-order.ts` and
 * `lib/patch-tool-order-utils.ts` (jeeves-core 0.7.0 step 4, #121).
 *
 * - Locates the array by content across every `.js` / `.mjs` chunk; zero
 *   or multiple `toolOrder` assignments abort (fail closed).
 * - Idempotent: no-ops if already patched.
 * - Safe: uninstalled tools are filtered out at prompt-build time.
 *
 * @module
 */

import { applyDistPlan, findChunks, type PatchOutcome } from './distPatchIo.js';
import {
  allMatches,
  lineOf,
  planAcrossFiles,
  type TextPatchResult,
} from './textPatch.js';

/** Patch name used in outcomes and log lines. */
export const TOOL_ORDER_PATCH_NAME = 'tool-order';

/** Cheap substring filter: only chunks containing this are evaluated. */
export const TOOL_ORDER_PREFILTER = 'toolOrder';

/** Tools to insert, in order. */
export const TOOL_ORDER_TOOLS_TO_INSERT = ['watcher_search', 'watcher_scan'];

/** Insert before this tool in the `toolOrder` array. */
export const TOOL_ORDER_INSERT_BEFORE = 'grep';

/** Every `toolOrder = [` assignment (same shape `parseToolOrder` matches). */
const TOOL_ORDER_SITE = /toolOrder\s*=\s*\[/g;

/** Matches a single- or double-quoted string literal token. */
const QUOTED = /^(["'])(.*)\1$/;

/**
 * One `toolOrder` element: `raw` is the source token exactly as written
 * (a string literal or an identifier such as `AUTOMATIONS_TOOL_NAME`);
 * `name` is the unquoted form used for comparison.
 */
interface ToolOrderEntry {
  raw: string;
  name: string;
}

/** Quote a tool name for insertion as a new string-literal entry. */
export function quoteTool(name: string): string {
  return `"${name}"`;
}

/**
 * Parse the `toolOrder` array from file content.
 *
 * @returns The full match string, any declaration keyword prefix, the raw
 *   entries (verbatim tokens plus unquoted names), and the tool names; or
 *   `null` when no `toolOrder` assignment is present.
 */
export function parseToolOrder(content: string): {
  match: string;
  prefix: string;
  entries: ToolOrderEntry[];
  tools: string[];
} | null {
  // Capture an optional declaration keyword (const/let/var) before toolOrder.
  const re = /(?:(const|let|var)\s+)?toolOrder\s*=\s*\[([\s\S]*?)\]/;
  const m = re.exec(content);

  if (!m) return null;

  const prefix = m[1] ? `${m[1]} ` : '';
  const entries = m[2]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, name: QUOTED.exec(raw)?.[2] ?? raw }));

  return {
    match: m[0],
    prefix,
    entries,
    tools: entries.map((e) => e.name),
  };
}

/**
 * Build the patched `toolOrder` array string from raw source tokens,
 * written verbatim (tab-indented, one token per line). Callers quote new
 * entries with {@link quoteTool}; existing tokens pass through as-is so
 * identifier entries stay identifiers.
 */
export function buildToolOrderString(
  prefix: string,
  tokens: readonly string[],
): string {
  const body = tokens.map((t) => `\t\t${t}`).join(',\n');
  return `${prefix}toolOrder = [\n${body}\n\t]`;
}

/**
 * Evaluate the `toolOrder` patch for one chunk: insert `toolsToInsert`
 * immediately before `insertBefore`. Exactly one `toolOrder` assignment
 * may exist; zero is not-found, several (or an unparseable array or a
 * missing anchor) is ambiguous so the caller fails closed. All tools
 * already present counts as already patched (idempotent).
 */
export function evaluateToolOrderPatch(
  content: string,
  toolsToInsert: readonly string[],
  insertBefore: string,
): TextPatchResult {
  const sites = allMatches(content, TOOL_ORDER_SITE);
  if (sites.length === 0) return { status: 'not-found' };
  if (sites.length > 1) {
    return {
      status: 'ambiguous',
      detail: `${String(sites.length)} toolOrder arrays (expected exactly 1)`,
    };
  }

  const parsed = parseToolOrder(content);
  if (!parsed) {
    return {
      status: 'ambiguous',
      detail: 'toolOrder array could not be parsed',
    };
  }

  const index = content.indexOf(parsed.match);
  const line = lineOf(content, index);

  if (toolsToInsert.every((t) => parsed.tools.includes(t))) {
    return { status: 'already-patched', line, snippet: parsed.match };
  }

  const cleaned = parsed.entries.filter((e) => !toolsToInsert.includes(e.name));
  const anchor = cleaned.findIndex((e) => e.name === insertBefore);
  if (anchor === -1) {
    return {
      status: 'ambiguous',
      detail: `anchor tool "${insertBefore}" not found in toolOrder`,
    };
  }

  const raws = cleaned.map((e) => e.raw);
  const after = buildToolOrderString(parsed.prefix, [
    ...raws.slice(0, anchor),
    ...toolsToInsert.map(quoteTool),
    ...raws.slice(anchor),
  ]);
  return {
    status: 'patch',
    content:
      content.slice(0, index) +
      after +
      content.slice(index + parsed.match.length),
    line,
    before: parsed.match,
    after,
  };
}

/**
 * Run the `toolOrder` patch against a resolved OpenClaw dist directory.
 *
 * @remarks
 * Fails loudly (a `not-found` or `error` outcome) when the `toolOrder`
 * anchor cannot be located, e.g. against an unknown OpenClaw version
 * shape (Decision 70.3). `--dry-run` writes nothing.
 *
 * @param distDir - Resolved OpenClaw dist directory.
 * @param dryRun - When true, nothing is written.
 * @returns A structured outcome.
 */
export function runToolOrderPatch(
  distDir: string,
  dryRun: boolean,
): PatchOutcome {
  const results = findChunks(distDir, TOOL_ORDER_PREFILTER).map((c) => ({
    file: c.file,
    result: evaluateToolOrderPatch(
      c.content,
      TOOL_ORDER_TOOLS_TO_INSERT,
      TOOL_ORDER_INSERT_BEFORE,
    ),
  }));

  const plan = planAcrossFiles(results);
  return applyDistPlan(TOOL_ORDER_PATCH_NAME, distDir, plan, dryRun);
}
