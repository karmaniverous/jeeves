import { describe, expect, it } from 'vitest';

import {
  gatewayNotice,
  installNotices,
  RESTART_NOTICE,
  runHeaderLines,
} from './cliOutput.js';

const core = { workspace: { value: '/ws' }, configRoot: { value: '/cfg' } };

describe('cliOutput', () => {
  it('builds the run header, marking only dry runs', () => {
    expect(runHeaderLines('Jeeves platform install', core, true)).toEqual([
      'Jeeves platform install [dry run: no changes]',
      '  Workspace: /ws',
      '  Config root: /cfg',
      '',
    ]);
    expect(runHeaderLines('Jeeves platform install', core, false)[0]).toBe(
      'Jeeves platform install',
    );
  });

  it('has no notices without a config resolution', () => {
    expect(installNotices({}, false)).toEqual([]);
  });

  it('says nothing about the gateway when nothing changed', () => {
    expect(gatewayNotice({ changes: 0, live: 0, generations: [] })).toEqual([]);
  });

  it('reports live application instead of a restart when every change was hot-applied', () => {
    const lines = gatewayNotice({
      changes: 3,
      live: 3,
      generations: [4, 7, 5],
    });
    expect(lines).toEqual([
      'Plugin changes were applied live by the running OpenClaw gateway (gateway generation 7); no restart needed.',
    ]);
    expect(lines).not.toContain(RESTART_NOTICE);
    expect(gatewayNotice({ changes: 1, live: 1, generations: [] })[0]).toBe(
      'Plugin changes were applied live by the running OpenClaw gateway; no restart needed.',
    );
  });

  it('asks for a restart when any change was not hot-applied', () => {
    expect(gatewayNotice({ changes: 3, live: 2, generations: [4, 5] })).toEqual(
      [RESTART_NOTICE],
    );
  });
});
