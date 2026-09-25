import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeout = vi.fn();
vi.mock('../../plugin/http.js', () => ({
  fetchWithTimeout: (...args: unknown[]) =>
    fetchWithTimeout(...args) as Promise<Response>,
}));
vi.mock('../../discovery/getServiceUrl.js', () => ({
  getServiceUrl: (name: string) => {
    if (name === 'bad') throw new Error('no url');
    return `http://127.0.0.1/${name}`;
  },
}));

const { probeStatus, readStatusVersion } = await import('./serviceProbe.js');

afterEach(() => {
  fetchWithTimeout.mockReset();
});

describe('probeStatus', () => {
  it('fetches /status at the resolved URL', async () => {
    const response = new Response('{}');
    fetchWithTimeout.mockResolvedValue(response);
    await expect(probeStatus('watcher', 50)).resolves.toBe(response);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'http://127.0.0.1/watcher/status',
      50,
    );
  });

  it('returns undefined when unreachable or unresolvable', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(probeStatus('watcher', 50)).resolves.toBeUndefined();
    await expect(probeStatus('bad', 50)).resolves.toBeUndefined();
  });
});

describe('readStatusVersion', () => {
  it.each([
    ['{"version":"1.2.3"}', '1.2.3'],
    ['{"version":3}', undefined],
    ['[]', undefined],
    ['not json', undefined],
  ])('%s → %s', async (body, expected) => {
    await expect(readStatusVersion(new Response(body))).resolves.toBe(expected);
  });
});
