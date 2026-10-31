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
    ).toEqual({
      perFile: 15_000,
      total: 50_000,
      source: { perFile: 'config', total: 'config' },
    });
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
    ).toEqual({
      perFile: 8_000,
      total: 50_000,
      source: { perFile: 'config', total: 'config' },
    });
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
    ).toEqual({
      perFile: 9_000,
      total: 40_000,
      source: { perFile: 'config', total: 'config' },
    });
  });

  it('falls back to the built-in defaults and says so', () => {
    expect(resolveBootstrapLimits({}, ws, home)).toEqual({
      perFile: BOOTSTRAP_FILE_MAX_CHARS,
      total: BOOTSTRAP_TOTAL_MAX_CHARS,
      source: { perFile: 'unset', total: 'unset' },
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
      source: { perFile: 'config', total: 'config' },
    });
    expect(fake.lines()).toEqual([GET]);
  });

  it.each([
    ['config get fails', failed()],
    [
      'config get fails despite JSON output',
      { ...ok('{"defaults":{"bootstrapMaxChars":5}}'), exitCode: 1 },
    ],
    ['output is not JSON', ok('not json')],
  ])(
    'uses the defaults with source failed, and says so, when %s',
    async (_l, response) => {
      const fake = fakeRunner({ [GET]: response });
      const limits = await readBootstrapLimits(fake.runner, ws);
      expect(limits).toEqual({
        perFile: BOOTSTRAP_FILE_MAX_CHARS,
        total: BOOTSTRAP_TOTAL_MAX_CHARS,
        source: { perFile: 'failed', total: 'failed' },
      });
      expect(
        bootstrapReportLines({
          files: [],
          totalChars: 0,
          totalLevel: 'ok',
          limits,
        }).at(-1),
      ).toBe(
        "  (could not read OpenClaw's bootstrap limits; using the defaults)",
      );
    },
  );

  it('marks an invalid or missing limit unset, per limit', async () => {
    const fake = fakeRunner({
      [GET]: ok(
        JSON.stringify({
          defaults: { bootstrapMaxChars: -5, bootstrapTotalMaxChars: 40_000 },
        }),
      ),
    });
    const limits = await readBootstrapLimits(fake.runner, ws);
    expect(limits).toEqual({
      perFile: BOOTSTRAP_FILE_MAX_CHARS,
      total: 40_000,
      source: { perFile: 'unset', total: 'config' },
    });
    expect(
      bootstrapReportLines({
        files: [],
        totalChars: 0,
        totalLevel: 'ok',
        limits,
      }).at(-1),
    ).toBe(
      "  (OpenClaw's bootstrap limits are not set; using OpenClaw's defaults)",
    );
  });
});
