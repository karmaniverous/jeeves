import { describe, expect, it } from 'vitest';

import { describeExit, formatCommand, quoteArg } from './commandLine.js';

describe('quoteArg / formatCommand', () => {
  it.each([
    ['plugins', 'plugins'],
    [
      'npm:@karmaniverous/x-openclaw@1.0.0',
      'npm:@karmaniverous/x-openclaw@1.0.0',
    ],
    ['', "''"],
    ['[{"path":"a b"}]', `'[{"path":"a b"}]'`],
    ["it's", `'it'\\''s'`],
  ])('%j → %s', (arg, expected) => {
    expect(quoteArg(arg)).toBe(expected);
  });

  it('joins a command line', () => {
    expect(formatCommand('openclaw', ['config', 'get', 'plugins'])).toBe(
      'openclaw config get plugins',
    );
  });
});

describe('describeExit', () => {
  it('summarizes a non-zero exit', () => {
    expect(describeExit('icacls', ['C:\\t d', '/grant:r'], 5)).toBe(
      "icacls 'C:\\t d' /grant:r exited 5",
    );
  });
});
