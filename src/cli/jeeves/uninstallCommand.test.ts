/**
 * Tests for `jeeves uninstall` wiring: plain uninstall also removes the
 * Jeeves plugins (with the post-uninstall repair); dry run shows it all and
 * changes nothing. Child processes are faked; no OpenClaw is touched.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SOUL_MARKERS } from '../../constants/index.js';
import {
  type FakeRunner,
  fakeRunner,
  fakeTempFiles,
  ok,
} from './plugins/fakePorts.js';
import type * as PluginDepsModule from './plugins/pluginDeps.js';
import type { PluginWorkflowDeps } from './plugins/workflows.js';
import { registerUninstallCommand } from './uninstallCommand.js';

const W = 'jeeves-watcher-openclaw';

const state = vi.hoisted(() => ({
  fake: undefined as FakeRunner | undefined,
}));

vi.mock('./plugins/pluginDeps.js', async (importOriginal) => {
  const actual = await importOriginal<typeof PluginDepsModule>();
  return {
    ...actual,
    createPluginWorkflowDeps: (dryRun: boolean): PluginWorkflowDeps => {
      if (!state.fake) throw new Error('no fake runner');
      return {
        runner: state.fake.runner,
        fs: {
          isDirectory: () => false,
          readPackageName: () => undefined,
          removeDir: () => undefined,
        },
        tempFiles: fakeTempFiles().files,
        serverConfig: () =>
          Promise.reject(new Error('uninstall never writes the server config')),
        configDir: '/oc',
        log: (line) => {
          console.log(line);
        },
        dryRun,
      };
    },
  };
});

vi.mock('../../plugin/http.js', () => ({
  fetchWithTimeout: () => Promise.reject(new Error('offline')),
}));

describe('jeeves uninstall', () => {
  let dir: string;
  let ws: string;
  let out: string[];
  const soul = [
    'Mine.',
    '',
    `<!-- ${SOUL_MARKERS.begin} | core:1.0.0 | 2026-09-01T00:00:00Z -->`,
    'x',
    `<!-- ${SOUL_MARKERS.end} -->`,
  ].join('\n');

  beforeEach(() => {
    dir = join(
      tmpdir(),
      `jeeves-uninstall-cmd-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
    );
    ws = join(dir, 'ws');
    mkdirSync(ws, { recursive: true });
    writeFileSync(join(ws, 'SOUL.md'), soul);
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      out.push(a.map(String).join(' '));
    });
    state.fake = fakeRunner({
      'openclaw --version': ok('OpenClaw 2026.9.6'),
      'openclaw config get plugins': [
        ok(JSON.stringify({ entries: { [W]: { enabled: true } } })),
        ok(JSON.stringify({ entries: { [W]: { enabled: false } } })),
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  const run = async (...args: string[]) => {
    const program = new Command().exitOverride();
    registerUninstallCommand(program);
    await program.parseAsync(
      ['uninstall', '-w', ws, '-c', join(dir, 'cfg'), ...args],
      { from: 'user' },
    );
  };
  const mutations = () =>
    (state.fake?.lines() ?? []).filter((l) =>
      / plugins uninstall | config (set|unset) /.test(` ${l} `),
    );

  it('removes managed blocks and the Jeeves plugins without any flag', async () => {
    await run();
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf-8')).toBe('Mine.\n');
    expect(mutations()).toEqual([
      `openclaw plugins uninstall ${W} --force`,
      `openclaw config unset plugins.entries.${W}`,
    ]);
    expect(out.some((l) => l.includes('Restart the gateway'))).toBe(true);
  });

  it('dry run shows the plugin removal and changes nothing', async () => {
    await run('--dry-run');
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf-8')).toBe(soul);
    expect(mutations()).toEqual([]);
    expect(out).toContain(`[dry-run] openclaw plugins uninstall ${W} --force`);
    expect(out).toContain(
      `[dry-run] if left as {"enabled":false}: openclaw config unset plugins.entries.${W}`,
    );
    expect(out).toContain('Dry run complete. Nothing was changed.');
  });

  it('rejects the removed --plugins option', async () => {
    const program = new Command().exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    registerUninstallCommand(program);
    program.commands.forEach((c) => {
      c.exitOverride().configureOutput({ writeErr: () => undefined });
    });
    await expect(
      program.parseAsync(['uninstall', '-w', ws, '--plugins'], {
        from: 'user',
      }),
    ).rejects.toThrow(/unknown option/);
  });
});
