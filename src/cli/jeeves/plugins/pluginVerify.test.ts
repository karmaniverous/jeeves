import { describe, expect, it } from 'vitest';

import { failed, fakeRunner, ok } from './fakePorts.js';
import { checkInstalled, verifyInstalled } from './pluginVerify.js';

const ID = 'jeeves-watcher-openclaw';

describe('checkInstalled', () => {
  const list = (entry: Record<string, unknown>) => ({
    plugins: [{ id: 'other' }, { id: ID, ...entry }],
  });

  it.each([
    [{ version: '1.0.0', enabled: true }, { ok: true }],
    [
      { version: '0.9.0', enabled: true },
      { ok: false, observed: 'installed at 0.9.0, expected 1.0.0' },
    ],
    [
      { enabled: true },
      {
        ok: false,
        observed: 'installed at an unknown version, expected 1.0.0',
      },
    ],
    [
      { version: '1.0.0', enabled: false, status: 'error' },
      {
        ok: false,
        observed: 'installed at 1.0.0 but not enabled (status: error)',
      },
    ],
    [
      { version: '1.0.0' },
      {
        ok: false,
        observed: 'installed at 1.0.0 but not enabled (status: unknown)',
      },
    ],
  ])('%j -> %j', (entry, expected) => {
    expect(checkInstalled(list(entry), ID, '1.0.0')).toEqual(expected);
  });

  it('reports a missing plugin', () => {
    expect(checkInstalled({ plugins: [] }, ID, '1.0.0')).toEqual({
      ok: false,
      observed: 'not installed',
    });
  });
});

describe('verifyInstalled', () => {
  const LIST = 'openclaw plugins list --json';

  it('reads plugins list, tolerating log lines before the JSON', async () => {
    const body = JSON.stringify(
      { plugins: [{ id: ID, version: '1.0.0', enabled: true }] },
      null,
      2,
    );
    const fake = fakeRunner({ [LIST]: ok(`[plugins] warming up\n${body}`) });
    await expect(verifyInstalled(fake.runner, ID, '1.0.0')).resolves.toEqual({
      ok: true,
    });
    expect(fake.lines()).toEqual([LIST]);
  });

  it('reports a failed read', async () => {
    const fake = fakeRunner({ [LIST]: failed('registry locked', 2) });
    await expect(verifyInstalled(fake.runner, ID, '1.0.0')).resolves.toEqual({
      ok: false,
      observed: 'openclaw plugins list --json exited 2 (registry locked)',
    });
  });

  it('reports unexpected output', async () => {
    const fake = fakeRunner({ [LIST]: ok('not json') });
    const check = await verifyInstalled(fake.runner, ID, '1.0.0');
    expect(check.ok).toBe(false);
    expect(!check.ok && check.observed).toMatch(/^cannot read plugins list: /);
  });
});
