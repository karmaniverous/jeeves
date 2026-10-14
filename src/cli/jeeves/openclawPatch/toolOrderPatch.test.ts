import { describe, expect, it } from 'vitest';

import {
  buildToolOrderString,
  evaluateToolOrderPatch,
  parseToolOrder,
} from './toolOrderPatch.js';

// ── parseToolOrder ──────────────────────────────────────────────────

describe('parseToolOrder', () => {
  it('parses "const toolOrder = [...]" and captures const prefix', () => {
    const content = `const toolOrder = ["grep", "glob", "read"]`;
    const result = parseToolOrder(content);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe('const ');
    expect(result!.tools).toEqual(['grep', 'glob', 'read']);
  });

  it('parses "let toolOrder = [...]" and captures let prefix', () => {
    const content = `let toolOrder = ["a", "b"]`;
    const result = parseToolOrder(content);
    expect(result!.prefix).toBe('let ');
    expect(result!.tools).toEqual(['a', 'b']);
  });

  it('parses "var toolOrder = [...]" and captures var prefix', () => {
    const content = `var toolOrder = ['x', 'y', 'z']`;
    const result = parseToolOrder(content);
    expect(result!.prefix).toBe('var ');
    expect(result!.tools).toEqual(['x', 'y', 'z']);
  });

  it('parses "toolOrder = [...]" with no declaration keyword (empty prefix)', () => {
    const content = `toolOrder = ["grep", "glob"]`;
    const result = parseToolOrder(content);
    expect(result!.prefix).toBe('');
    expect(result!.tools).toEqual(['grep', 'glob']);
  });

  it('returns null when content has no toolOrder', () => {
    const content = `const foo = ["a", "b"];\nconst bar = 42;`;
    expect(parseToolOrder(content)).toBeNull();
  });

  it('handles multiline array', () => {
    const content = `const toolOrder = [
\t\t"grep",
\t\t"glob",
\t\t"read"
\t]`;
    const result = parseToolOrder(content);
    expect(result!.tools).toEqual(['grep', 'glob', 'read']);
  });

  it('returns the full match string for replacement', () => {
    const content = `const toolOrder = ["a", "b"]`;
    const result = parseToolOrder(content);
    expect(result!.match).toBe('const toolOrder = ["a", "b"]');
  });

  it('handles single-quoted strings', () => {
    const content = `toolOrder = ['grep', 'glob']`;
    const result = parseToolOrder(content);
    expect(result!.tools).toEqual(['grep', 'glob']);
  });

  it('keeps raw tokens alongside unquoted names, identifiers included', () => {
    const content = `toolOrder = ["read", AUTOMATIONS_TOOL_NAME, 'grep']`;
    expect(parseToolOrder(content)!.entries).toEqual([
      { raw: '"read"', name: 'read' },
      { raw: 'AUTOMATIONS_TOOL_NAME', name: 'AUTOMATIONS_TOOL_NAME' },
      { raw: "'grep'", name: 'grep' },
    ]);
  });
});

// ── buildToolOrderString ────────────────────────────────────────────

describe('buildToolOrderString', () => {
  it('builds string with empty prefix', () => {
    const result = buildToolOrderString('', ['"grep"', '"glob"']);
    expect(result).toBe(`toolOrder = [\n\t\t"grep",\n\t\t"glob"\n\t]`);
  });

  it('builds string with "const " prefix', () => {
    const result = buildToolOrderString('const ', ['"a"', '"b"', '"c"']);
    expect(result).toBe(
      `const toolOrder = [\n\t\t"a",\n\t\t"b",\n\t\t"c"\n\t]`,
    );
  });

  it('formats each tool on its own tab-indented line', () => {
    const result = buildToolOrderString('', ['"x"']);
    expect(result).toBe(`toolOrder = [\n\t\t"x"\n\t]`);
  });

  it('produces valid replacement for round-trip with parseToolOrder', () => {
    const original = `const toolOrder = ["grep", "glob", "read"]`;
    const parsed = parseToolOrder(original)!;
    const rebuilt = buildToolOrderString(
      parsed.prefix,
      parsed.entries.map((e) => e.raw),
    );
    // Re-parse the rebuilt string to verify tools are preserved
    const reparsed = parseToolOrder(rebuilt);
    expect(reparsed!.tools).toEqual(parsed.tools);
    expect(reparsed!.prefix).toBe(parsed.prefix);
  });

  it('writes identifier tokens verbatim (unquoted)', () => {
    expect(buildToolOrderString('', ['"a"', 'AUTOMATIONS_TOOL_NAME'])).toBe(
      `toolOrder = [\n\t\t"a",\n\t\tAUTOMATIONS_TOOL_NAME\n\t]`,
    );
  });
});

// ── evaluateToolOrderPatch ──────────────────────────────────────────

describe('evaluateToolOrderPatch', () => {
  const INSERT = ['watcher_search', 'watcher_scan'];
  const SRC = 'x();\n\tconst toolOrder = ["read", "grep", "glob"];\n';

  it('inserts before the anchor with line, before and after', () => {
    const r = evaluateToolOrderPatch(SRC, INSERT, 'grep');
    expect(r.status).toBe('patch');
    if (r.status !== 'patch') return;
    expect(r.line).toBe(2);
    expect(r.before).toBe('const toolOrder = ["read", "grep", "glob"]');
    expect(r.after).toBe(
      buildToolOrderString('const ', [
        '"read"',
        '"watcher_search"',
        '"watcher_scan"',
        '"grep"',
        '"glob"',
      ]),
    );
    expect(r.content).toBe(`x();\n\t${r.after};\n`);
    expect(evaluateToolOrderPatch(r.content, INSERT, 'grep').status).toBe(
      'already-patched',
    );
  });

  it('re-inserts cleanly when partially patched', () => {
    const src = 'toolOrder = ["watcher_scan", "read", "grep"]';
    const r = evaluateToolOrderPatch(src, INSERT, 'grep');
    expect(r.status).toBe('patch');
    if (r.status !== 'patch') return;
    expect(parseToolOrder(r.content)!.tools).toEqual([
      'read',
      'watcher_search',
      'watcher_scan',
      'grep',
    ]);
  });

  it('writes existing tokens verbatim and quotes only new entries', () => {
    const src = `toolOrder = ['read', AUTOMATIONS_TOOL_NAME, "grep"]`;
    const r = evaluateToolOrderPatch(src, INSERT, 'grep');
    expect(r.status).toBe('patch');
    if (r.status !== 'patch') return;
    expect(r.after).toBe(
      buildToolOrderString('', [
        "'read'",
        'AUTOMATIONS_TOOL_NAME',
        '"watcher_search"',
        '"watcher_scan"',
        '"grep"',
      ]),
    );
    expect(evaluateToolOrderPatch(r.content, INSERT, 'grep').status).toBe(
      'already-patched',
    );
  });

  it('reports already-patched when the tools sit immediately before the anchor', () => {
    const src =
      'toolOrder = ["read", "watcher_search", "watcher_scan", "grep"]';
    const r = evaluateToolOrderPatch(src, INSERT, 'grep');
    expect(r).toEqual({ status: 'already-patched', line: 1, snippet: src });
  });

  it('reports upstream-fixed when every tool is ahead of the anchor in another arrangement', () => {
    const src =
      'toolOrder = ["watcher_scan", "read", "watcher_search", "grep"]';
    const r = evaluateToolOrderPatch(src, INSERT, 'grep');
    expect(r).toEqual({ status: 'upstream-fixed', line: 1, snippet: src });
  });

  it('moves tools that sit after the anchor into place', () => {
    const src =
      'toolOrder = ["read", "grep", "watcher_search", "watcher_scan"]';
    const r = evaluateToolOrderPatch(src, INSERT, 'grep');
    expect(r.status).toBe('patch');
    if (r.status !== 'patch') return;
    expect(parseToolOrder(r.content)!.tools).toEqual([
      'read',
      'watcher_search',
      'watcher_scan',
      'grep',
    ]);
  });

  it('is ambiguous when the tools are present but the anchor is gone', () => {
    const src = 'toolOrder = ["watcher_search", "watcher_scan", "read"]';
    expect(evaluateToolOrderPatch(src, INSERT, 'grep').status).toBe(
      'ambiguous',
    );
  });

  it('reports not-found when there is no toolOrder assignment', () => {
    expect(
      evaluateToolOrderPatch('const toolOrderX = 1;', INSERT, 'grep').status,
    ).toBe('not-found');
  });

  it.each([
    ['multiple toolOrder arrays', `${SRC}${SRC}`, 'grep'],
    ['a missing anchor', SRC, 'nope'],
  ])('is ambiguous for %s', (_label, content, anchor) => {
    expect(evaluateToolOrderPatch(content, INSERT, anchor).status).toBe(
      'ambiguous',
    );
  });
});
