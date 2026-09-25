import { describe, expect, it } from 'vitest';

import {
  buildInstallPlan,
  buildUninstallPlan,
  describeStep,
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

describe('buildInstallPlan', () => {
  it('orders installs, then legacy removal, then one config batch', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0', {
          legacyDir: '/oc/extensions/jeeves-watcher-openclaw',
        }),
        target('meta', '2.0.0'),
      ],
      {},
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'exec',
      'exec',
      'removeDir',
      'configSetBatch',
    ]);
    expect(describeStep(steps[3])).toEqual([
      'openclaw config set --batch-file <private temp file>',
      expect.stringMatching(/^ {2}batch file content: \[/) as string,
    ]);
  });

  it('skips the install step of an already installed target', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0', { installed: true }),
        target('meta', '2.0.0'),
      ],
      {},
    );
    expect(
      steps.flatMap((s) => (s.kind === 'exec' ? [s.args[2]] : [])),
    ).toEqual(['npm:@karmaniverous/jeeves-meta-openclaw@2.0.0']);
    const batch = steps.at(-1);
    expect(batch?.kind === 'configSetBatch' && batch.ops).toHaveLength(2);
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
      {
        path: 'plugins.entries.jeeves-watcher-openclaw.hooks.allowConversationAccess',
        value: true,
      },
    ]);
  });

  it('returns no steps for no targets', () => {
    expect(buildInstallPlan([], {})).toEqual([]);
  });

  it('appends plugin config to the hook batch and redacts secrets', () => {
    const steps = buildInstallPlan(
      [target('server', '1.0.0')],
      {},
      {
        ops: [
          {
            path: 'plugins.entries.jeeves-server-openclaw.config.pluginKey',
            value: 'topsecret',
          },
        ],
        values: [],
        secrets: ['topsecret'],
        unknownPluginIds: [],
      },
    );
    const batch = steps[1];
    expect(batch).toMatchObject({
      kind: 'configSetBatch',
      redact: ['topsecret'],
    });
    expect(batch.kind === 'configSetBatch' && batch.ops).toEqual([
      {
        path: 'plugins.entries.jeeves-server-openclaw.hooks.allowConversationAccess',
        value: true,
      },
      {
        path: 'plugins.entries.jeeves-server-openclaw.config.pluginKey',
        value: 'topsecret',
      },
    ]);
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
        ops: [],
        values: [],
        secrets: ['topsecret'],
        unknownPluginIds: [],
        serverKeyWrite: write,
      },
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'serverKeyWrite',
      'exec',
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

describe('describeStep', () => {
  it('describes removals and repairs', () => {
    expect(describeStep({ kind: 'removeDir', path: '/x' })).toEqual([
      'remove legacy plugin copy: /x',
    ]);
    expect(
      describeStep({
        kind: 'repairAfterUninstall',
        before: { load: { paths: [] } },
        pluginIds: ['a-openclaw'],
      }),
    ).toEqual([
      'if left as {"enabled":false}: openclaw config unset plugins.entries.a-openclaw',
      'if plugins.load was removed: openclaw config set --batch-file <private temp file> with [{"path":"plugins.load","value":{"paths":[]}}]',
    ]);
  });
});
