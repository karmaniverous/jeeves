import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyDistPlan,
  assertWritable,
  findChunks,
  listDistChunks,
} from './distPatchIo.js';
import { lineOf, planAcrossFiles, type TextPatchResult } from './textPatch.js';

/** Content marker used to locate the target chunk. */
const MARKER = 'SAMPLE_PATCH_SITE';

/** Synthetic dist chunk carrying the patch site. */
const TARGET = [
  '//#region src/sample.ts',
  `const ${MARKER} = { enabled: true };`,
  'export { SAMPLE_PATCH_SITE };',
].join('\n');

const UNPATCHED = 'SAMPLE_PATCH_SITE = { enabled: true }';
const PATCHED = 'SAMPLE_PATCH_SITE = { enabled: false }';

/** Sample patch: flip `enabled: true` to `false` at the marker. */
const samplePatch = (content: string): TextPatchResult => {
  const done = content.indexOf(PATCHED);
  if (done >= 0) {
    return {
      status: 'already-patched',
      line: lineOf(content, done),
      snippet: PATCHED,
    };
  }
  const todo = content.indexOf(UNPATCHED);
  if (todo < 0) return { status: 'not-found' };
  return {
    status: 'patch',
    content: content.replace(UNPATCHED, PATCHED),
    line: lineOf(content, todo),
    before: UNPATCHED,
    after: PATCHED,
  };
};

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-patch-io-'));
  fs.writeFileSync(path.join(dir, 'sample-tool-AB.mjs'), TARGET);
  fs.writeFileSync(path.join(dir, 'agent-tools.policy-CD.mjs'), 'const b = 2;');
  fs.writeFileSync(path.join(dir, 'legacy-EF.js'), 'const a = 1;');
  fs.writeFileSync(path.join(dir, 'types.d.ts'), MARKER);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const plan = () =>
  planAcrossFiles(
    findChunks(dir, MARKER).map((c) => ({
      file: c.file,
      result: samplePatch(c.content),
    })),
  );

describe('listDistChunks / findChunks', () => {
  it('lists .js and .mjs only', () => {
    expect(listDistChunks(dir)).toEqual([
      'agent-tools.policy-CD.mjs',
      'legacy-EF.js',
      'sample-tool-AB.mjs',
    ]);
  });

  it('finds chunks by content marker', () => {
    expect(findChunks(dir, MARKER).map((c) => c.file)).toEqual([
      'sample-tool-AB.mjs',
    ]);
  });
});

describe('assertWritable', () => {
  it('passes for a writable file', () => {
    expect(() => {
      assertWritable(path.join(dir, 'sample-tool-AB.mjs'));
    }).not.toThrow();
  });

  it('names the path and the current user when read-only', () => {
    const target = path.join(dir, 'sample-tool-AB.mjs');
    fs.chmodSync(target, 0o444);
    try {
      expect(() => {
        assertWritable(target);
      }).toThrow(
        new RegExp(
          `${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*${os.userInfo().username}`,
        ),
      );
    } finally {
      fs.chmodSync(target, 0o644);
    }
  });

  // Windows ignores directory mode bits, and root bypasses them.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails when the directory is read-only, since the write renames a temp file',
    () => {
      const target = path.join(dir, 'sample-tool-AB.mjs');
      fs.chmodSync(dir, 0o555);
      try {
        expect(() => {
          assertWritable(target);
        }).toThrow(`Dist directory is not writable: ${dir}`);
      } finally {
        fs.chmodSync(dir, 0o755);
      }
    },
  );
});

describe('applyDistPlan', () => {
  const target = () => path.join(dir, 'sample-tool-AB.mjs');

  it('dry run previews without writing', () => {
    const outcome = applyDistPlan('t', dir, plan(), true);
    expect(outcome.status).toBe('patched');
    expect(fs.readFileSync(target(), 'utf8')).toBe(TARGET);
  });

  it('live run writes, then reports already patched', () => {
    const first = applyDistPlan('t', dir, plan(), false);
    expect(first.status).toBe('patched');
    expect(fs.readFileSync(target(), 'utf8')).toContain(
      'SAMPLE_PATCH_SITE = { enabled: false }',
    );
    const second = plan();
    expect(second.status === 'found' && second.result.status).toBe(
      'already-patched',
    );
    const outcome = applyDistPlan('t', dir, second, false);
    expect(outcome.status).toBe('already-patched');
  });

  it('returns a not-found outcome for not-found plans', () => {
    const outcome = applyDistPlan(
      't',
      dir,
      { status: 'not-found', message: 'nope' },
      true,
    );
    expect(outcome).toEqual({
      name: 't',
      status: 'not-found',
      message: 'nope',
    });
  });

  it('returns an error outcome for error plans', () => {
    const outcome = applyDistPlan(
      't',
      dir,
      { status: 'error', message: 'ambiguous' },
      true,
    );
    expect(outcome).toEqual({
      name: 't',
      status: 'error',
      message: 'ambiguous',
    });
  });

  it('fails up front (naming path and user) instead of writing a read-only target', () => {
    fs.chmodSync(target(), 0o444);
    try {
      const outcome = applyDistPlan('t', dir, plan(), false);
      expect(outcome.status).toBe('error');
      expect(outcome.message).toContain(target());
      expect(outcome.message).toContain(os.userInfo().username);
      // Content is untouched: the write never happened.
      expect(fs.readFileSync(target(), 'utf8')).toBe(TARGET);
    } finally {
      fs.chmodSync(target(), 0o644);
    }
  });

  it('reports upstream-fixed and writes nothing', () => {
    const outcome = applyDistPlan(
      't',
      dir,
      {
        status: 'found',
        file: 'sample-tool-AB.mjs',
        result: { status: 'upstream-fixed', line: 2, snippet: 'x' },
      },
      false,
    );
    expect(outcome).toEqual({
      name: 't',
      status: 'upstream-fixed',
      message:
        'upstream-fixed: OpenClaw no longer needs this patch (sample-tool-AB.mjs:2)',
    });
    expect(fs.readFileSync(target(), 'utf8')).toBe(TARGET);
  });

  it('sends progress to the injected logger and failures to its error sink', () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const logger = {
      log: (l: string) => logs.push(l),
      error: (l: string) => errors.push(l),
    };
    applyDistPlan('t', dir, plan(), true, logger);
    applyDistPlan(
      't',
      dir,
      { status: 'not-found', message: 'nope' },
      true,
      logger,
    );
    expect(logs[0]).toBe('[t] WOULD PATCH sample-tool-AB.mjs:2');
    expect(errors).toEqual(['[t] FAILED — nope']);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('a dry run reports the read-only failure a live run would hit', () => {
    fs.chmodSync(target(), 0o444);
    try {
      const outcome = applyDistPlan('t', dir, plan(), true);
      expect(outcome.status).toBe('error');
      expect(outcome.message).toContain(target());
      expect(fs.readFileSync(target(), 'utf8')).toBe(TARGET);
    } finally {
      fs.chmodSync(target(), 0o644);
    }
  });
});
