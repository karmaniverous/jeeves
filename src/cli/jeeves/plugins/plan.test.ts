import { describe, expect, it } from 'vitest';

import { describeStep } from './describeStep.js';
import {
  buildInstallPlan,
  buildUninstallPlan,
  type ResolvedTarget,
} from './plan.js';
import { parsePluginSpec } from './pluginSpec.js';

const target = (
  spec: string,
  version: string,
  extra: Partial<ResolvedTarget> = {},
): ResolvedTarget => ({
  ...parsePluginSpec(spec),
  version,
  conversationHooks: ['before_prompt_build'],
  ...extra,
});

const resolution = (
  ops: { path: string; value: unknown }[],
  secrets: string[] = [],
) => ({ ops, values: [], secrets, unknownPluginIds: [] });

const WATCHER = 'plugins.entries.jeeves-watcher-openclaw';
const SERVER = 'plugins.entries.jeeves-server-openclaw';
const META = 'plugins.entries.jeeves-meta-openclaw';

describe('buildInstallPlan', () => {
  it('per plugin: config batch, install, sweep; then legacy removal and the final batch', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0', {
          legacyDir: '/oc/extensions/jeeves-watcher-openclaw',
        }),
        target('meta', '2.0.0'),
      ],
      {},
      resolution([
        { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
        { path: `${META}.config.configRoot`, value: '/srv/cfg' },
        { path: `${META}.config.apiUrl`, value: 'http://127.0.0.1:1938' },
      ]),
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'configSetBatch',
      'exec',
      'migrationSweep',
      'configSetBatch',
      'exec',
      'migrationSweep',
      'removeDir',
      'configSetBatch',
    ]);
    const ops = (i: number) => {
      const step = steps[i];
      return step.kind === 'configSetBatch' ? step.ops : undefined;
    };
    expect(ops(0)).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
    ]);
    expect(steps[1]).toMatchObject({
      args: expect.arrayContaining([
        'install',
        'npm:@karmaniverous/jeeves-watcher-openclaw@1.0.0',
      ]) as string[],
    });
    expect(ops(3)?.map((o) => o.path)).toEqual([
      `${META}.config.configRoot`,
      `${META}.config.apiUrl`,
    ]);
    expect(ops(7)?.map((o) => o.path)).toEqual([
      `${WATCHER}.hooks.allowConversationAccess`,
      `${META}.hooks.allowConversationAccess`,
    ]);
    expect(describeStep(steps[2])).toEqual([
      'openclaw plugins inspect --all --json (lets OpenClaw clear pending plugin migrations)',
    ]);
    expect(describeStep(steps[7])).toEqual([
      'openclaw config set --batch-file <private temp file>',
      expect.stringMatching(/^ {2}batch file content: \[/) as string,
    ]);
  });

  it('writes the watcher configRoot before its install (overriding the manifest default)', () => {
    const steps = buildInstallPlan(
      [target('watcher', '1.0.0', { conversationHooks: [] })],
      {},
      resolution([{ path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' }]),
    );
    expect(steps).toEqual([
      {
        kind: 'configSetBatch',
        ops: [{ path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' }],
      },
      expect.objectContaining({ kind: 'exec' }),
      { kind: 'migrationSweep' },
    ]);
  });

  it('skips the install of an already installed target but still writes its config', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0', { installed: true }),
        target('meta', '2.0.0'),
      ],
      {},
      resolution([{ path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' }]),
    );
    expect(
      steps.flatMap((s) => (s.kind === 'exec' ? [s.args[2]] : [])),
    ).toEqual(['npm:@karmaniverous/jeeves-meta-openclaw@2.0.0']);
    expect(steps.map((s) => s.kind)).toEqual([
      'exec',
      'migrationSweep',
      'configSetBatch',
    ]);
    const batch = steps.at(-1);
    expect(batch?.kind === 'configSetBatch' && batch.ops).toEqual([
      { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
      { path: `${META}.hooks.allowConversationAccess`, value: true },
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
    ]);
  });

  it('sweeps before the final batch when nothing is installed', () => {
    const steps = buildInstallPlan(
      [target('watcher', '1.0.0', { installed: true })],
      {},
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'migrationSweep',
      'configSetBatch',
    ]);
  });

  it('grants hook access only to targets that declare conversation hooks', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0'),
        target('runner', '1.0.0', { conversationHooks: [] }),
      ],
      {},
    );
    const batch = steps.at(-1);
    expect(batch?.kind === 'configSetBatch' && batch.ops).toEqual([
      { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
    ]);
  });

  it('returns no steps for no targets', () => {
    expect(buildInstallPlan([], {})).toEqual([]);
  });

  it('plans no config batch when there is no config to write', () => {
    const steps = buildInstallPlan(
      [target('runner', '1.0.0', { conversationHooks: [] })],
      {},
    );
    expect(steps.map((s) => s.kind)).toEqual(['exec', 'migrationSweep']);
  });

  it('writes secrets before the install, redacted in output', () => {
    const steps = buildInstallPlan(
      [target('server', '1.0.0')],
      {},
      resolution(
        [{ path: `${SERVER}.config.pluginKey`, value: 'topsecret' }],
        ['topsecret'],
      ),
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'configSetBatch',
      'exec',
      'migrationSweep',
      'configSetBatch',
    ]);
    const batch = steps[0];
    expect(batch).toEqual({
      kind: 'configSetBatch',
      ops: [{ path: `${SERVER}.config.pluginKey`, value: 'topsecret' }],
      redact: ['topsecret'],
    });
    const shown = describeStep(batch).join('\n');
    expect(shown).not.toContain('topsecret');
    expect(shown).toContain('"value":"<redacted>"');
    expect(steps[3]).toMatchObject({
      ops: [{ path: `${SERVER}.hooks.allowConversationAccess`, value: true }],
      redact: ['topsecret'],
    });
  });

  it('puts a planned server keys._plugin write first, redacted in output', () => {
    const write = {
      path: '/cfg/jeeves-server/config.json',
      value: 'topsecret',
      expect: { kind: 'literal' as const, value: 'old' },
    };
    const steps = buildInstallPlan(
      [target('server', '1.0.0')],
      {},
      {
        ...resolution([], ['topsecret']),
        serverKeyWrite: write,
      },
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'serverKeyWrite',
      'exec',
      'migrationSweep',
      'configSetBatch',
    ]);
    const shown = describeStep(steps[0]).join('\n');
    expect(shown).toContain(
      'set keys._plugin = <redacted> in /cfg/jeeves-server/config.json (replacing the current seed;',
    );
    expect(shown).not.toContain('topsecret');
    expect(shown).not.toContain('"old"');
  });
});

describe('buildUninstallPlan', () => {
  it('ends with the post-uninstall repair', () => {
    const steps = buildUninstallPlan(
      [{ pluginId: 'jeeves-meta-openclaw' }],
      {},
    );
    expect(steps.map((s) => s.kind)).toEqual(['exec', 'repairAfterUninstall']);
  });

  it('returns no steps for no targets', () => {
    expect(buildUninstallPlan([], {})).toEqual([]);
  });
});
