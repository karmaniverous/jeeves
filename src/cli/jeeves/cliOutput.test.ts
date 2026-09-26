import { describe, expect, it } from 'vitest';

import { installNotices, runHeaderLines } from './cliOutput.js';

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
});
