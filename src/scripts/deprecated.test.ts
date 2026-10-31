import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import * as root from '../index.js';
import * as deprecated from './deprecated.js';
import { getArgImpl, parseArgsImpl } from './fs-utils.js';
import * as scripts from './index.js';
import * as slackWorkspace from './slack-workspace.js';

const source = readFileSync(join(import.meta.dirname, 'deprecated.ts'), 'utf8');

/** The TSDoc block directly above an exported function. */
function docOf(name: string): string {
  const at = source.indexOf(`export function ${name}(`);
  const asyncAt = source.indexOf(`export async function ${name}(`);
  const end = at >= 0 ? at : asyncAt;
  return source.slice(source.lastIndexOf('/**', end), end);
}

describe('#127 deprecations', () => {
  it.each([
    ['parseArgs', 'Use `parseRunnableArgs`. Removed in 4.0.0.'],
    ['getArg', 'Use `parseRunnableArgs`. Removed in 4.0.0.'],
    ['getChannelWorkspace', 'No remaining consumer. Removed in 4.0.0.'],
  ])('tags %s with the spec message', (name, message) => {
    expect(docOf(name)).toContain(`@deprecated ${message}`);
  });

  it('exports the aliases from both entry points, but not the internals', () => {
    for (const entry of [root, scripts] as Record<string, unknown>[]) {
      for (const name of ['parseArgs', 'getArg', 'getChannelWorkspace'])
        expect(entry[name]).toBe((deprecated as Record<string, unknown>)[name]);
      for (const name of [
        'parseArgsImpl',
        'getArgImpl',
        'getChannelWorkspaceImpl',
      ])
        expect(entry).not.toHaveProperty(name);
    }
  });

  it('parseArgs and getArg behave as their internals', () => {
    const d = deprecated as Record<string, (...a: unknown[]) => unknown>;
    const argv = ['--a=1', '--count', '10', 'x'];
    expect(d.parseArgs(argv)).toEqual(parseArgsImpl(argv));
    expect(d.getArg(argv, '--count', '0')).toBe(
      getArgImpl(argv, '--count', '0'),
    );
    expect(d.getArg(argv, '--none', 'z')).toBe('z');
  });

  it('getChannelWorkspace delegates to its internal', async () => {
    const impl = vi
      .spyOn(slackWorkspace, 'getChannelWorkspaceImpl')
      .mockResolvedValue('T1');
    const d = deprecated as Record<string, (...a: unknown[]) => unknown>;
    const options = { cachePath: '/c.json', defaultWorkspace: 'T0' };
    await expect(d.getChannelWorkspace('C1', 'tok', options)).resolves.toBe(
      'T1',
    );
    expect(impl).toHaveBeenCalledWith('C1', 'tok', options);
  });
});
