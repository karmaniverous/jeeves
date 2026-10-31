import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import type { ConfigApplyRequest } from '../api/configApplyHandler.js';
import type { StatusResponse } from '../api/statusHandler.js';
import { defineCatalog } from './defineCatalog.js';
import { errorBodySchema } from './errorBody.js';
import { queryArray } from './queryArray.js';
import {
  configApplyBodySchema,
  configApplyResponseSchema,
  configQueryResponseSchema,
  standardEntries,
  statusResponseSchema,
} from './standardEntries.js';

const bearer = { schemes: [{ in: 'bearer' }] } as const;

describe('standardEntries', () => {
  it('returns status, config and configApply with per-component descriptions', () => {
    const [status, config, configApply] = standardEntries('watcher', {
      auth: { config: bearer },
    });
    expect([status.name, config.name, configApply.name]).toEqual([
      'status',
      'config',
      'configApply',
    ]);
    expect([status.method, status.path]).toEqual(['GET', '/status']);
    expect([config.method, config.path]).toEqual(['GET', '/config']);
    expect([configApply.method, configApply.path]).toEqual([
      'POST',
      '/config/apply',
    ]);
    expect([status.kind, config.kind, configApply.kind]).toEqual([
      'read',
      'read',
      'write',
    ]);
    // Same descriptions as the 0.7.0 standard tools.
    expect(status.description).toBe(
      'Get watcher service health, version, and uptime.',
    );
    expect(config.description).toBe(
      'Query watcher running configuration. Optional JSONPath filter.',
    );
    expect(configApply.description).toBe(
      'Apply a config patch to the running watcher service.',
    );
  });

  it('applies auth: config to both config routes, status open by default', () => {
    const [status, config, configApply] = standardEntries('watcher', {
      auth: { config: bearer },
    });
    expect(status.auth).toBe('none');
    expect(config.auth).toBe(bearer);
    expect(configApply.auth).toBe(bearer);
    const [guarded] = standardEntries('watcher', {
      auth: { config: 'none', status: bearer },
    });
    expect(guarded.auth).toBe(bearer);
  });

  it('passes defineCatalog', () => {
    expect(() =>
      defineCatalog(standardEntries('acme', { auth: { config: 'none' } })),
    ).not.toThrow();
  });

  it('uses the component health schema when given', () => {
    const healthSchema = z.object({ points: z.number() });
    const [status] = standardEntries('watcher', {
      auth: { config: 'none' },
      healthSchema,
    });
    const body = {
      name: 'watcher',
      version: '1.0.0',
      uptime: 3,
      status: 'healthy',
      health: { points: 7 },
    };
    expect(status.response.parse(body)).toEqual(body);
    expect(
      status.response.safeParse({ ...body, health: { points: 'x' } }).success,
    ).toBe(false);
    expectTypeOf(status.response.parse(body).health).toEqualTypeOf<{
      points: number;
    }>();
  });

  it('describes what createStatusHandler returns, including degraded health', () => {
    const [status] = standardEntries('acme', { auth: { config: 'none' } });
    const degraded = {
      name: 'acme',
      version: '0.1.0',
      uptime: 0,
      status: 'degraded',
      health: { error: 'boom' },
    };
    expect(status.response.parse(degraded)).toEqual(degraded);
  });

  it('config response keeps every key of a full config and of matches', () => {
    const full = { result: 1, count: 'x', watch: { paths: ['a'] } };
    expect(configQueryResponseSchema.parse(full)).toEqual(full);
    const lookalike = { result: [1], count: 1, watch: { paths: ['a'] } };
    expect(configQueryResponseSchema.parse(lookalike)).toEqual(lookalike);
    const matches = { result: [1, 2], count: 2 };
    expect(configQueryResponseSchema.parse(matches)).toEqual(matches);
  });

  it('config apply body and response match the handler', () => {
    expect(
      configApplyBodySchema.parse({ patch: { a: 1 }, replace: true }),
    ).toEqual({ patch: { a: 1 }, replace: true });
    expect(configApplyBodySchema.safeParse({}).success).toBe(false);
    const ok = { applied: true, config: { a: 1 }, warning: 'callback failed' };
    expect(configApplyResponseSchema.parse(ok)).toEqual(ok);
  });

  it('schemas are assignable both ways to the exported 0.7.0 types', () => {
    const sample: StatusResponse = {
      name: 'acme',
      version: '1.0.0',
      uptime: 1,
      status: 'healthy',
      health: {},
    };
    expect(
      statusResponseSchema(z.record(z.string(), z.unknown())).parse(sample),
    ).toEqual(sample);
    type Status = z.output<
      ReturnType<
        typeof statusResponseSchema<z.ZodRecord<z.ZodString, z.ZodUnknown>>
      >
    >;
    expectTypeOf<Status>().toExtend<StatusResponse>();
    expectTypeOf<StatusResponse>().toExtend<Status>();
    type Apply = z.output<typeof configApplyBodySchema>;
    expectTypeOf<Apply>().toExtend<ConfigApplyRequest>();
    expectTypeOf<ConfigApplyRequest>().toExtend<Apply>();
  });
});

describe('errorBodySchema', () => {
  it('requires error and keeps extra fields', () => {
    const body = { error: 'Config validation failed', issues: [{ path: [] }] };
    expect(errorBodySchema.parse(body)).toEqual(body);
    expect(errorBodySchema.safeParse({ message: 'x' }).success).toBe(false);
  });
});

describe('queryArray', () => {
  const tags = queryArray(z.coerce.number());

  it('turns one value into an array and keeps arrays', () => {
    expect(tags.parse('5')).toEqual([5]);
    expect(tags.parse(['1', '2'])).toEqual([1, 2]);
  });

  it('tries the array branch first, so a coercing item never swallows an array', () => {
    expect(queryArray(z.coerce.string()).parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('converts to JSON Schema in both modes', () => {
    expect(z.toJSONSchema(tags, { io: 'input' })).toMatchObject({
      anyOf: [{ type: 'array' }, { type: 'number' }],
    });
    expect(z.toJSONSchema(tags, { io: 'output' })).toMatchObject({
      type: 'array',
      items: { type: 'number' },
    });
  });

  it('encodes an array back unchanged', () => {
    expect(z.encode(queryArray(z.string()), ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('rejects values its item rejects', () => {
    expect(tags.safeParse(['x']).success).toBe(false);
  });

  it('types its output as an array of the item output', () => {
    expectTypeOf(tags.parse('1')).toEqualTypeOf<number[]>();
    expect(queryArray(z.enum(['a'])).parse('a')).toEqual(['a']);
  });
});
