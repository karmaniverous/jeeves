/**
 * Raw-file behaviour of the config apply handler: unknown keys, defaults,
 * unreadable files and file modes (#113, #114).
 */
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { init, resetInit } from '../init';
import { makeTestDescriptor } from '../test/makeTestDescriptor';
import { createConfigApplyHandler } from './configApplyHandler';

const testSchema = z.object({
  port: z.number().int().positive().default(1936),
  watchPaths: z.array(z.string()).default([]),
  debug: z.boolean().default(false),
});

function makeDescriptor() {
  return makeTestDescriptor({
    configSchema: testSchema,
    initTemplate: () => ({ port: 1936, watchPaths: [], debug: false }),
    startCommand: (cp: string) => ['node', 'index.js', '-c', cp],
  });
}

describe('createConfigApplyHandler raw file handling', () => {
  let testDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `jeeves-ca-raw-test-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    configDir = join(testDir, 'config');
    mkdirSync(join(configDir, 'jeeves-watcher'), { recursive: true });
    init({ workspacePath: join(testDir, 'workspace'), configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('writes the merged raw config, not the parsed one (#113)', () => {
    const configPath = () => join(configDir, 'jeeves-watcher', 'config.json');

    it('keeps keys the schema does not know, in their original order', async () => {
      writeFileSync(
        configPath(),
        JSON.stringify({
          apiUrl: 'http://127.0.0.1:1936',
          port: 1936,
          configRoot: '/opt/jeeves/config',
          extra: { nested: true },
        }),
      );

      const handler = createConfigApplyHandler(makeDescriptor());
      const result = await handler({ patch: { port: 2000, debug: true } });

      expect(result.status).toBe(200);
      const text = readFileSync(configPath(), 'utf-8');
      expect(JSON.parse(text)).toEqual({
        apiUrl: 'http://127.0.0.1:1936',
        port: 2000,
        configRoot: '/opt/jeeves/config',
        extra: { nested: true },
        debug: true,
      });
      expect(Object.keys(JSON.parse(text) as object)).toEqual([
        'apiUrl',
        'port',
        'configRoot',
        'extra',
        'debug',
      ]);
    });

    it('does not inject schema defaults into the file', async () => {
      writeFileSync(configPath(), JSON.stringify({ port: 1936 }));

      const handler = createConfigApplyHandler(makeDescriptor());
      const result = await handler({ patch: { debug: true } });

      expect(result.status).toBe(200);
      expect(JSON.parse(readFileSync(configPath(), 'utf-8'))).toEqual({
        port: 1936,
        debug: true,
      });
      // The response and callback still carry the validated config.
      const body = result.body as { config: Record<string, unknown> };
      expect(body.config.watchPaths).toEqual([]);
    });

    it('leaves the file untouched when the merged config is invalid', async () => {
      const original = '{\n  "port": 1936,\n  "custom": "x"\n}\n';
      writeFileSync(configPath(), original);

      const handler = createConfigApplyHandler(makeDescriptor());
      const result = await handler({ patch: { port: -1 } });

      expect(result.status).toBe(400);
      expect(readFileSync(configPath(), 'utf-8')).toBe(original);
    });

    it.each([
      ['not JSON', '{ "port": 1936,'],
      ['not an object', '[1, 2]'],
    ])(
      'refuses to overwrite an unreadable file (%s)',
      async (_label, original) => {
        writeFileSync(configPath(), original);

        const handler = createConfigApplyHandler(makeDescriptor());
        const result = await handler({ patch: { port: 2000 } });

        expect(result.status).toBe(500);
        expect((result.body as { error: string }).error).toContain(
          'Could not read config file',
        );
        expect(readFileSync(configPath(), 'utf-8')).toBe(original);
      },
    );
  });

  describe.skipIf(process.platform === 'win32')(
    'file mode (POSIX, #114)',
    () => {
      const configPath = () => join(configDir, 'jeeves-watcher', 'config.json');
      const modeOf = (p: string) => statSync(p).mode & 0o777;

      it('keeps an existing 0600 mode', async () => {
        writeFileSync(configPath(), JSON.stringify({ port: 1936 }));
        chmodSync(configPath(), 0o600);

        const handler = createConfigApplyHandler(makeDescriptor());
        const result = await handler({ patch: { debug: true } });

        expect(result.status).toBe(200);
        expect(modeOf(configPath())).toBe(0o600);
      });

      it('keeps another existing mode', async () => {
        writeFileSync(configPath(), JSON.stringify({ port: 1936 }));
        chmodSync(configPath(), 0o640);

        await createConfigApplyHandler(makeDescriptor())({
          patch: { debug: true },
        });

        expect(modeOf(configPath())).toBe(0o640);
      });

      it('creates a new file with mode 0600', async () => {
        const result = await createConfigApplyHandler(makeDescriptor())({
          patch: { port: 2000 },
        });

        expect(result.status).toBe(200);
        expect(modeOf(configPath())).toBe(0o600);
      });
    },
  );
});
