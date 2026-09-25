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
  legacyDir?: string,
): ResolvedTarget => ({
  ...parsePluginSpec(spec),
  version,
  ...(legacyDir ? { legacyDir } : {}),
});

describe('buildInstallPlan', () => {
  it('orders installs, then legacy removal, then one hook batch', () => {
    const steps = buildInstallPlan(
      [
        target('watcher', '1.0.0', '/oc/extensions/jeeves-watcher-openclaw'),
        target('meta', '2.0.0'),
      ],
      {},
    );
    expect(steps.map((s) => s.kind)).toEqual([
      'exec',
      'exec',
      'removeDir',
      'exec',
    ]);
    expect(describeStep(steps[3])[0]).toMatch(
      /^openclaw config set --batch-json '\[/,
    );
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
    expect(batch).toMatchObject({ kind: 'exec', redact: ['topsecret'] });
    expect(batch.kind === 'exec' && JSON.parse(batch.args[3])).toEqual([
      {
        path: 'plugins.entries.jeeves-server-openclaw.hooks.allowConversationAccess',
        value: true,
      },
      {
        path: 'plugins.entries.jeeves-server-openclaw.config.pluginKey',
        value: 'topsecret',
      },
    ]);
    expect(describeStep(batch)[0]).not.toContain('topsecret');
    expect(describeStep(batch)[0]).toContain('"value":"<redacted>"');
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
        before: {},
        pluginIds: ['a-openclaw'],
      }),
    ).toEqual([
      'if left as {"enabled":false}: openclaw config unset plugins.entries.a-openclaw',
    ]);
  });
});
