/**
 * Tests for Slack workspace resolver.
 * Uses mocked fetch to avoid real API calls.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getChannelWorkspace, saveCache } from './slack-workspace.js';

let tmpDir: string;
let cachePath: string;

const DEFAULT_WORKSPACE = 'T_DEFAULT';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-slack-ws-test-'));
  cachePath = path.join(tmpDir, 'channel-cache.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('getChannelWorkspace', () => {
  it('returns cached value without API call', async () => {
    // Pre-populate cache
    fs.writeFileSync(cachePath, JSON.stringify({ C123: 'T_CACHED' }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await getChannelWorkspace('C123', 'xoxb-token', {
      cachePath,
      defaultWorkspace: DEFAULT_WORKSPACE,
    });

    expect(result).toBe('T_CACHED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('queries API for unknown channel and caches result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { shared_team_ids: ['T_FOREIGN'] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getChannelWorkspace('C_NEW', 'xoxb-token', {
      cachePath,
      defaultWorkspace: DEFAULT_WORKSPACE,
    });

    expect(result).toBe('T_FOREIGN');

    // Flush cache and verify
    saveCache();
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Record<
      string,
      string
    >;
    expect(cached['C_NEW']).toBe('T_FOREIGN');
  });

  it('returns default workspace on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500 }),
    );

    const result = await getChannelWorkspace('C_ERR', 'xoxb-token', {
      cachePath,
      defaultWorkspace: DEFAULT_WORKSPACE,
    });

    expect(result).toBe(DEFAULT_WORKSPACE);
  });

  it('returns default workspace when channel has no foreign teams', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { shared_team_ids: [DEFAULT_WORKSPACE] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await getChannelWorkspace('C_LOCAL', 'xoxb-token', {
      cachePath,
      defaultWorkspace: DEFAULT_WORKSPACE,
    });

    expect(result).toBe(DEFAULT_WORKSPACE);
  });
});

describe('saveCache', () => {
  it('persists dirty cache to disk', async () => {
    // Query a new channel so the cache becomes dirty
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          channel: { shared_team_ids: ['T_SAVE'] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await getChannelWorkspace('C_SAVE', 'xoxb-token', {
      cachePath,
      defaultWorkspace: DEFAULT_WORKSPACE,
    });

    saveCache();
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Record<
      string,
      string
    >;
    expect(cached['C_SAVE']).toBe('T_SAVE');
  });
});
