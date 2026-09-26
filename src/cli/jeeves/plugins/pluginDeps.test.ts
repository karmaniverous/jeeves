import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { useUnsetEnv } from '../../../test/cliHarness.js';
import { useTempDir } from '../../../test/tempDir.js';
import {
  createPluginConfigRequest,
  createPluginWorkflowDeps,
} from './pluginDeps.js';

describe('createPluginWorkflowDeps', () => {
  useUnsetEnv('OPENCLAW_STATE_DIR');
  useUnsetEnv('OPENCLAW_CONFIG_PATH');

  it('passes dry run through, resolves the OpenClaw config dir and logs to stdout', () => {
    process.env['OPENCLAW_STATE_DIR'] = '/srv/openclaw';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const dry = createPluginWorkflowDeps(true);
      expect(dry.dryRun).toBe(true);
      expect(createPluginWorkflowDeps(false).dryRun).toBe(false);
      expect(dry.configDir).toBe(resolve('/srv/openclaw'));
      dry.log('line');
      expect(log).toHaveBeenCalledWith('line');
    } finally {
      log.mockRestore();
    }
  });
});

describe('createPluginConfigRequest', () => {
  const tempDir = useTempDir('jeeves-plugin-deps-');

  it('reads keys._plugin from the server config under a config root', () => {
    const root = tempDir();
    mkdirSync(join(root, 'jeeves-server'), { recursive: true });
    writeFileSync(
      join(root, 'jeeves-server', 'config.json'),
      '{"keys":{"_plugin":"seed"}}',
    );
    const request = createPluginConfigRequest({}, {});
    expect(request.readServerKey(root)).toEqual({
      kind: 'literal',
      value: 'seed',
    });
    expect(request.readServerKey(join(root, 'missing'))).toEqual({
      kind: 'noFile',
    });
  });

  it('carries options, file values and an inherited root only when given', () => {
    const options = { configRoot: '/opt' };
    const file = { meta: { apiUrl: 'http://m:1' } };
    expect(createPluginConfigRequest(options, file, '/env')).toMatchObject({
      options,
      file,
      inheritedConfigRoot: '/env',
    });
    expect(createPluginConfigRequest(options, file)).not.toHaveProperty(
      'inheritedConfigRoot',
    );
    expect(createPluginConfigRequest({}, {}).generateSecret()).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});
