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
  it('one config batch first, then per plugin install + sweep, then legacy removal', () => {
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
      'pluginInstall',
      'migrationSweep',
      'pluginInstall',
      'migrationSweep',
      'removeDir',
    ]);
    const first = steps[0];
    expect(first.kind === 'configSetBatch' && first.ops).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
      { path: `${META}.config.configRoot`, value: '/srv/cfg' },
      { path: `${META}.config.apiUrl`, value: 'http://127.0.0.1:1938' },
      { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
      { path: `${META}.hooks.allowConversationAccess`, value: true },
    ]);
    expect(steps[1]).toEqual({
      kind: 'pluginInstall',
      pluginId: 'jeeves-watcher-openclaw',
      packageName: '@karmaniverous/jeeves-watcher-openclaw',
      version: '1.0.0',
    });
    expect(describeStep(steps[1])).toEqual([
      'openclaw plugins install npm:@karmaniverous/jeeves-watcher-openclaw@1.0.0 --pin --accept-capabilities --force',
    ]);
    expect(describeStep(steps[2])).toEqual([
      'openclaw plugins inspect --all --json (lets OpenClaw clear pending plugin migrations)',
    ]);
    expect(describeStep(steps[0])).toEqual([
      'openclaw config set --batch-file <private temp file>',
      expect.stringMatching(/^ {2}batch file content: \[/) as string,
    ]);
  });

  it('writes exactly one config batch however many plugins are installed', () => {
    const steps = buildInstallPlan(
      [
        target('runner', '1.0.0'),
        target('watcher', '1.0.0'),
        target('server', '1.0.0'),
        target('meta', '1.0.0'),
      ],
      {},
      resolution([
        { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
        { path: `${META}.config.configRoot`, value: '/srv/cfg' },
        { path: `${SERVER}.config.pluginKey`, value: 'k' },
      ]),
    );
    const kinds = steps.map((s) => s.kind);
    expect(kinds.filter((k) => k === 'configSetBatch')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'pluginInstall')).toHaveLength(4);
    expect(kinds.indexOf('configSetBatch')).toBeLessThan(
      kinds.indexOf('pluginInstall'),
    );
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
      expect.objectContaining({ kind: 'pluginInstall' }),
      { kind: 'migrationSweep' },
    ]);
  });

  it('grants hook access before the install, so the first registration has it', () => {
    const steps = buildInstallPlan([target('watcher', '1.0.0')], {});
    expect(steps).toEqual([
      {
        kind: 'configSetBatch',
        ops: [
          { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
        ],
      },
      expect.objectContaining({ kind: 'pluginInstall' }),
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
      steps.flatMap((s) => (s.kind === 'pluginInstall' ? [s.pluginId] : [])),
    ).toEqual(['jeeves-meta-openclaw']);
    expect(steps.map((s) => s.kind)).toEqual([
      'configSetBatch',
      'pluginInstall',
      'migrationSweep',
    ]);
    const batch = steps[0];
    expect(batch.kind === 'configSetBatch' && batch.ops).toEqual([
      { path: `${WATCHER}.config.configRoot`, value: '/srv/cfg' },
      { path: `${WATCHER}.hooks.allowConversationAccess`, value: true },
      { path: `${META}.hooks.allowConversationAccess`, value: true },
    ]);
  });

  it('sweeps before the batch when nothing is installed', () => {
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
    const batch = steps[0];
    expect(batch.kind === 'configSetBatch' && batch.ops).toEqual([
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
    expect(steps.map((s) => s.kind)).toEqual([
      'pluginInstall',
      'migrationSweep',
    ]);
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
      'pluginInstall',
      'migrationSweep',
    ]);
    const batch = steps[0];
    expect(batch).toEqual({
      kind: 'configSetBatch',
      ops: [
        { path: `${SERVER}.config.pluginKey`, value: 'topsecret' },
        { path: `${SERVER}.hooks.allowConversationAccess`, value: true },
      ],
      redact: ['topsecret'],
    });
    const shown = describeStep(batch).join('\n');
    expect(shown).not.toContain('topsecret');
    expect(shown).toContain('"value":"<redacted>"');
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
      'configSetBatch',
      'pluginInstall',
      'migrationSweep',
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
