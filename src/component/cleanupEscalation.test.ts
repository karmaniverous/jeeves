import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../plugin/http.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('requestCleanupSession', () => {
  it('emits the cleanup session request to the gateway', async () => {
    const { fetchWithTimeout } = await import('../plugin/http.js');
    const { requestCleanupSession } = await import('./cleanupEscalation.js');

    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const accepted = await requestCleanupSession({
      gatewayUrl: 'http://127.0.0.1:3456/',
      filePath: 'J:/jeeves/TOOLS.md',
      markerIdentity: 'TOOLS',
    });

    expect(accepted).toBe(true);
    expect(fetchWithTimeout).toHaveBeenCalledOnce();

    const [url, timeoutMs, init] = vi.mocked(fetchWithTimeout).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3456/sessions/spawn');
    expect(timeoutMs).toBe(5_000);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });

    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(init?.body as string) as {
      label: string;
      task: string;
    };
    expect(body.label).toBe('cleanup:TOOLS.md');
    expect(body.task).toContain('J:/jeeves/TOOLS.md');
    expect(body.task).toContain('TOOLS managed comment markers');
    expect(body.task).toContain('Preserve any unique user-authored content');
  });

  it('returns false when the gateway is unavailable', async () => {
    const { fetchWithTimeout } = await import('../plugin/http.js');
    const { requestCleanupSession } = await import('./cleanupEscalation.js');

    vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('ECONNREFUSED'));

    const accepted = await requestCleanupSession({
      gatewayUrl: 'http://127.0.0.1:3456',
      filePath: 'J:/jeeves/SOUL.md',
      markerIdentity: 'SOUL',
    });

    expect(accepted).toBe(false);
    expect(fetchWithTimeout).toHaveBeenCalledOnce();
  });
});
