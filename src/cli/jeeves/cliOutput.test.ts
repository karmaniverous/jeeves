import { describe, expect, it } from 'vitest';

import { dryRunSuffix, installNotices, runHeaderLines } from './cliOutput.js';

const core = { workspace: { value: '/ws' }, configRoot: { value: '/cfg' } };

describe('cliOutput', () => {
  it('marks dry runs', () => {
    expect(dryRunSuffix(true)).toBe(' [dry run: no changes]');
    expect(dryRunSuffix(false)).toBe('');
  });

  it('builds the run header', () => {
    expect(runHeaderLines('Jeeves platform install', core, true)).toEqual([
      'Jeeves platform install [dry run: no changes]',
      '  Workspace: /ws',
      '  Config root: /cfg',
      '',
    ]);
  });

  it('has no notices without a config resolution', () => {
    expect(installNotices({}, false)).toEqual([]);
  });
});
