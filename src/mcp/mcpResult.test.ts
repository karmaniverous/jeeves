/**
 * MCP result mapping, one test per row of the spec 0.12.0 §5.2 Results
 * table (Decision 98, #175).
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { toolResultFromResponse } from '../catalog/catalogTool.js';
import type { CatalogResponse } from '../catalog/httpTransport.js';
import type { CatalogEntry } from '../catalog/types.js';
import {
  DEFAULT_MAX_IMAGE_BYTES,
  mcpResultFromResponse,
  toCallToolResult,
} from './mcpResult.js';

const entryOf = (contentType?: string): CatalogEntry => ({
  name: 'thing',
  method: 'GET',
  path: '/thing',
  description: 'A thing.',
  response: contentType ? z.instanceof(Uint8Array) : z.object({}),
  ...(contentType ? { contentType } : {}),
  auth: 'none',
  kind: 'read',
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const respond = (
  body: string | Uint8Array,
  contentType: string,
  status = 200,
): CatalogResponse =>
  new Response(body, { status, headers: { 'content-type': contentType } });

/** What a plugin tool gets for the same entry and response, as MCP. */
const asPlugin = async (
  contentType: string | undefined,
  res: CatalogResponse,
) => toCallToolResult(await toolResultFromResponse(entryOf(contentType), res));

const map = (
  contentType: string | undefined,
  res: CatalogResponse,
  max = DEFAULT_MAX_IMAGE_BYTES,
) => mcpResultFromResponse(entryOf(contentType), res, max);

describe('mcpResultFromResponse (spec 5.2 Results)', () => {
  it.each([
    [undefined, JSON.stringify({ a: 1 }), 'application/json'],
    ['text/markdown', '# Hi', 'text/markdown'],
  ])('maps %s as plugin tools do', async (declared, body, type) => {
    const result = await map(declared, respond(body, type));
    expect(result.isError).toBe(false);
    expect(result).toEqual(await asPlugin(declared, respond(body, type)));
  });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])(
    'maps a declared %s to an image result with the declared type',
    async (type) => {
      const result = await map(type, respond(PNG, 'application/octet-stream'));
      expect(result).toEqual({
        content: [
          {
            type: 'image',
            data: Buffer.from(PNG).toString('base64'),
            mimeType: type,
          },
        ],
        isError: false,
      });
    },
  );

  it('reads the response type for a declared image/*', async () => {
    const result = await map('image/*', respond(PNG, 'image/webp'));
    expect(result.content[0]).toMatchObject({
      type: 'image',
      mimeType: 'image/webp',
    });
  });

  it('ignores media-type parameters and case', async () => {
    const result = await map('image/*', respond(PNG, 'IMAGE/PNG; q=1'));
    expect(result.content[0]).toMatchObject({
      type: 'image',
      mimeType: 'image/png',
    });
  });

  it.each([
    ['declared', 'image/svg+xml', 'image/svg+xml'],
    ['via image/*', 'image/*', 'image/svg+xml; charset=utf-8'],
  ])('maps SVG %s to text', async (_label, declared, actual) => {
    const result = await map(declared, respond('<svg/>', actual));
    expect(result).toEqual({
      content: [{ type: 'text', text: '<svg/>' }],
      isError: false,
    });
  });

  it('says so when an image/* response has no Content-Type', async () => {
    const res = new Response(PNG, { status: 200 });
    res.headers.delete('content-type');
    const result = await map('image/*', res);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Missing Content-Type');
  });

  it('is an error result for another type under image/*', async () => {
    const result = await map('image/*', respond(PNG, 'image/tiff'));
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      text: expect.stringContaining('image/tiff') as string,
    });
  });

  it('defers a non-image media range to plugin mapping', async () => {
    const result = await map('application/*', respond(PNG, 'application/pdf'));
    expect(result).toEqual(
      await asPlugin('application/*', respond(PNG, 'application/pdf')),
    );
  });

  it('is the existing error result for other binary', async () => {
    const result = await map(
      'application/pdf',
      respond(PNG, 'application/pdf'),
    );
    expect(result.isError).toBe(true);
    expect(result).toEqual(
      await asPlugin('application/pdf', respond(PNG, 'application/pdf')),
    );
  });

  it('is an error result with size and limit over maxImageBytes, never truncated', async () => {
    const result = await map('image/png', respond(PNG, 'image/png'), 3);
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining(
        'Image of 4 bytes exceeds the limit of 3 bytes',
      ) as string,
    });
  });

  it('maps a non-2xx as plugin tools do', async () => {
    const result = await map('image/png', respond('nope', 'text/plain', 404));
    expect(result.isError).toBe(true);
    expect(result).toEqual(
      await asPlugin('image/png', respond('nope', 'text/plain', 404)),
    );
  });

  it('leaves plugin tools unchanged: binary images stay an error there', async () => {
    const plugin = await toolResultFromResponse(
      entryOf('image/png'),
      respond(PNG, 'image/png'),
    );
    expect(plugin.isError).toBe(true);
  });
});
