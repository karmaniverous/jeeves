/**
 * 0.7.0 baseline for the standard plugin tools (spec §5, dev-plan step 0).
 *
 * @remarks
 * Captured from untouched 0.7.0 code so the 0.8.0 rebuild of the standard
 * tools on the endpoint catalog (dev-plan step 9) can be proven equal: tool
 * names, descriptions and parameters, and each tool's result and timeout for
 * every outcome. The snapshot files beside this test are the baseline. Never
 * regenerate them with `vitest -u`: a mismatch here is a regression, not a
 * stale snapshot.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPluginToolset } from '../../plugin/createPluginToolset.js';
import type { ToolDescriptor, ToolResult } from '../../plugin/types.js';
import { makeTestDescriptor } from '../makeTestDescriptor.js';

vi.mock('../../service/createServiceManager', () => ({
  createServiceManager: () => ({}),
}));

const API_URL = 'http://svc.test:1936';

/** Tools for a fixed descriptor, keyed by name. */
function tools(): Record<string, ToolDescriptor> {
  const list = createPluginToolset(makeTestDescriptor({ name: 'acme' }), {
    apiUrl: API_URL,
  });
  return Object.fromEntries(list.map((t) => [t.name, t]));
}

/** A fetch mock answering every request with one response. */
function respond(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

/** A fetch mock rejecting like an unreachable host. */
function refuse(): ReturnType<typeof vi.fn> {
  return vi.fn(() =>
    Promise.reject(
      new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }),
    ),
  );
}

/** A fetch mock that settles only when its signal aborts. */
function hang(): ReturnType<typeof vi.fn> {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('This operation was aborted', 'AbortError'));
        });
      }),
  );
}

/** Run a tool against a fetch mock; record its result and requests. */
async function run(
  name: string,
  params: Record<string, unknown>,
  fetchMock: ReturnType<typeof vi.fn>,
): Promise<{ result: ToolResult; requests: unknown[] }> {
  vi.stubGlobal('fetch', fetchMock);
  const result = await tools()[name].execute('call-1', params);
  const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];
  const requests = calls.map(([url, init]) => ({
    url,
    method: init?.method ?? 'GET',
    body: init?.body ?? null,
  }));
  return { result, requests };
}

/**
 * Milliseconds after which a tool's request aborts: pending at `ms - 1`,
 * settled at `ms`. `AbortSignal.timeout` is routed through the faked
 * `setTimeout`, so the check holds whichever timeout mechanism a tool uses.
 */
async function abortsAt(
  name: string,
  params: Record<string, unknown>,
  ms: number,
): Promise<{ pendingBefore: boolean; result: ToolResult }> {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((timeoutMs) => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException('signal timed out', 'TimeoutError'));
    }, timeoutMs);
    return controller.signal;
  });
  vi.stubGlobal('fetch', hang());
  let settled = false;
  const pending = tools()
    [name].execute('call-1', params)
    .then((r) => {
      settled = true;
      return r;
    });
  await vi.advanceTimersByTimeAsync(ms - 1);
  const pendingBefore = !settled;
  await vi.advanceTimersByTimeAsync(1);
  return { pendingBefore, result: await pending };
}

/**
 * Parameters in 0.7.0 form. Since 0.8.0 the standard tools' parameters are
 * generated from the standard entries with Zod's `toJSONSchema` (spec 5.7),
 * which adds keywords the hand-written 0.7.0 schemas lacked: a top-level
 * `additionalProperties: false`, and `propertyNames` / `additionalProperties`
 * on the record-typed `config` patch. `config_apply` also gains the
 * optional `replace` boolean. Removing exactly those leaves names, types,
 * descriptions and `required` to compare byte for byte with the 0.7.0
 * snapshot.
 *
 * @param parameters - A tool's parameters.
 * @returns The parameters without the 0.8.0 additions.
 */
function as070(parameters: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...parameters };
  delete rest.additionalProperties;
  const properties = { ...(rest.properties as Record<string, unknown>) };
  delete properties.replace;
  if (properties.config) {
    const config = { ...(properties.config as Record<string, unknown>) };
    delete config.propertyNames;
    delete config.additionalProperties;
    properties.config = config;
  }
  return { ...rest, properties };
}

describe('0.7.0 baseline: standard plugin tools', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names, descriptions and parameters', async () => {
    const shape = Object.values(tools()).map(
      ({ name, description, parameters }) => ({
        name,
        description,
        parameters: as070(parameters),
      }),
    );
    await expect(JSON.stringify(shape, null, 2) + '\n').toMatchFileSnapshot(
      './standardTools.shape.json',
    );
  });

  it('results per outcome', async () => {
    const outcomes = {
      status: {
        success: await run('acme_status', {}, respond(200, { status: 'ok' })),
        httpError: await run('acme_status', {}, respond(503, 'unavailable')),
        unreachable: await run('acme_status', {}, refuse()),
      },
      config: {
        success: await run('acme_config', {}, respond(200, { a: 1 })),
        withPath: await run(
          'acme_config',
          { path: '$.a b' },
          respond(200, { result: [1], count: 1 }),
        ),
        httpError: await run('acme_config', {}, respond(400, 'bad path')),
        unreachable: await run('acme_config', {}, refuse()),
      },
      configApply: {
        success: await run(
          'acme_config_apply',
          { config: { a: 2 } },
          respond(200, { applied: true, config: { a: 2 } }),
        ),
        httpError: await run(
          'acme_config_apply',
          { config: { a: 2 } },
          respond(400, 'invalid'),
        ),
        missingConfig: await run('acme_config_apply', {}, respond(200, {})),
        unreachable: await run(
          'acme_config_apply',
          { config: { a: 2 } },
          refuse(),
        ),
      },
    };
    await expect(JSON.stringify(outcomes, null, 2) + '\n').toMatchFileSnapshot(
      './standardTools.results.json',
    );
  });

  it.each([
    ['acme_status', {}, 5_000],
    ['acme_config', {}, 120_000],
    ['acme_config_apply', { config: { a: 2 } }, 120_000],
  ])('%s aborts after %i ms', async (name, params, ms) => {
    const { pendingBefore, result } = await abortsAt(name, params, ms);
    expect(pendingBefore).toBe(true);
    expect(result.isError).toBe(true);
  });
});
