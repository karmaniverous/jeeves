import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLEANUP_FLAG } from '../constants/index.js';
import { hasCleanupFlag, requestCleanupSession } from './cleanupEscalation.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hasCleanupFlag', () => {
  it('returns true when cleanup flag is present', () => {
    const content = `Some content\n\n${CLEANUP_FLAG}\n\nMore content`;
    expect(hasCleanupFlag(content)).toBe(true);
  });

  it('returns false when cleanup flag is absent', () => {
    const content = '# Normal File\n\nNothing special here.';
    expect(hasCleanupFlag(content)).toBe(false);
  });
});

describe('requestCleanupSession', () => {
  it('returns true when gateway accepts the request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await requestCleanupSession({
      gatewayUrl: 'http://localhost:3000',
      filePath: '/workspace/TOOLS.md',
      markerIdentity: 'TOOLS',
    });

    expect(result).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('http://localhost:3000/sessions/spawn');
    expect(opts?.method).toBe('POST');

    const body = JSON.parse(opts?.body as string) as {
      task: string;
      label: string;
    };
    expect(body.label).toBe('cleanup:/workspace/TOOLS.md');
    expect(body.task).toContain('TOOLS');
    expect(body.task).toContain('orphaned managed content');
  });

  it('returns false when gateway returns non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500 }),
    );

    const result = await requestCleanupSession({
      gatewayUrl: 'http://localhost:3000',
      filePath: '/workspace/SOUL.md',
      markerIdentity: 'SOUL',
    });

    expect(result).toBe(false);
  });

  it('returns false when gateway is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );

    const result = await requestCleanupSession({
      gatewayUrl: 'http://localhost:9999',
      filePath: '/workspace/AGENTS.md',
      markerIdentity: 'AGENTS',
    });

    expect(result).toBe(false);
  });

  it('returns false on timeout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('AbortError'));
          }, 100);
        }),
    );

    const result = await requestCleanupSession({
      gatewayUrl: 'http://localhost:3000',
      filePath: '/workspace/TOOLS.md',
      markerIdentity: 'TOOLS',
    });

    expect(result).toBe(false);
  });
});
