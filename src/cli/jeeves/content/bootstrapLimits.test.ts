/**
 * Tests for resolving the bootstrap limits a workspace is subject to,
 * including per-agent overrides (#120).
 */

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { failed, fakeRunner, ok } from '../plugins/fakePorts.js';
import {
  readBootstrapLimits,
  resolveBootstrapLimits,
} from './bootstrapLimits.js';
import {
  BOOTSTRAP_TOTAL_MAX_CHARS,
  bootstrapReportLines,
} from './bootstrapReport.js';
import { BOOTSTRAP_FILE_MAX_CHARS } from './budgets.js';

const home = path.resolve('/home/jeeves');
const ws = path.join(home, 'workspace');
const GET = 'openclaw config get agents --json';

describe('resolveBootstrapLimits', () => {
  it('uses agents.defaults when no agent owns the workspace', () => {
    expect(
      resolveBootstrapLimits(
        {
          defaults: {
            bootstrapMaxChars: 15_000,
            bootstrapTotalMaxChars: 50_000,
          },
          entries: {
            other: {
              workspace: path.join(home, 'elsewhere'),
              bootstrapMaxChars: 1,
            },
            sub: { bootstrapMaxChars: 2 },
          },
        },
        ws,
        home,
      ),
    ).toEqual({ perFile: 15_000, total: 50_000, defaulted: false });
  });

  it("applies the owning agent's override, inheriting what it omits", () => {
    expect(
      resolveBootstrapLimits(
        {
          defaults: {
            bootstrapMaxChars: 15_000,
            bootstrapTotalMaxChars: 50_000,
          },
          entries: {
            main: { workspace: '~/workspace/', bootstrapMaxChars: 8_000 },
          },
        },
        ws,
        home,
      ),
    ).toEqual({ perFile: 8_000, total: 50_000, defaulted: false });
  });

  it('takes the smallest limit when several agents share the workspace', () => {
    expect(
      resolveBootstrapLimits(
        {
          entries: {
            a: {
              workspace: ws,
              bootstrapMaxChars: 9_000,
              bootstrapTotalMaxChars: 70_000,
            },
            b: {
              workspace: ws,
              bootstrapMaxChars: 12_000,
              bootstrapTotalMaxChars: 40_000,
            },
          },
        },
        ws,
        home,
      ),
    ).toEqual({ perFile: 9_000, total: 40_000, defaulted: false });
  });

  it('falls back to the built-in defaults and says so', () => {
    expect(resolveBootstrapLimits({}, ws, home)).toEqual({
      perFile: BOOTSTRAP_FILE_MAX_CHARS,
      total: BOOTSTRAP_TOTAL_MAX_CHARS,
      defaulted: true,
    });
  });
});

describe('readBootstrapLimits', () => {
  it('reads the agents slice from OpenClaw once', async () => {
    const fake = fakeRunner({
      [GET]: ok(
        JSON.stringify({
          defaults: {
            bootstrapMaxChars: 15_000,
            bootstrapTotalMaxChars: 50_000,
          },
        }),
      ),
    });
    await expect(readBootstrapLimits(fake.runner, ws)).resolves.toEqual({
      perFile: 15_000,
      total: 50_000,
      defaulted: false,
    });
    expect(fake.lines()).toEqual([GET]);
  });

  it.each([
    ['config get fails', failed()],
    ['output is not JSON', ok('not json')],
    [
      'values are invalid',
      ok(JSON.stringify({ defaults: { bootstrapMaxChars: -5 } })),
    ],
  ])(
    'uses the defaults, and the report says so, when %s',
    async (_l, response) => {
      const fake = fakeRunner({ [GET]: response });
      const limits = await readBootstrapLimits(fake.runner, ws);
      expect(limits).toEqual({
        perFile: BOOTSTRAP_FILE_MAX_CHARS,
        total: BOOTSTRAP_TOTAL_MAX_CHARS,
        defaulted: true,
      });
      expect(
        bootstrapReportLines({
          files: [],
          totalChars: 0,
          totalLevel: 'ok',
          limits,
        }).at(-1),
      ).toMatch(/using the defaults/);
    },
  );
});
