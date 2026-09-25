import { describe, expect, it } from 'vitest';

import { describeConfigBatchLines, describeStep } from './describeStep.js';

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

describe('describeConfigBatchLines', () => {
  it('shows the placeholder command and the redacted content', () => {
    expect(
      describeConfigBatchLines([{ path: 'a.b', value: 's3cr3t' }], ['s3cr3t']),
    ).toEqual([
      'openclaw config set --batch-file <private temp file>',
      '  batch file content: [{"path":"a.b","value":"<redacted>"}]',
    ]);
  });
});
