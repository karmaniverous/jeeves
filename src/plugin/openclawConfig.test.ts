import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  patchConfig,
  resolveConfigPath,
  resolveOpenClawHome,
} from './openclawConfig.js';

describe('resolveOpenClawHome', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG;
    savedEnv.OPENCLAW_HOME = process.env.OPENCLAW_HOME;
    delete process.env.OPENCLAW_CONFIG;
    delete process.env.OPENCLAW_HOME;
  });

  afterEach(() => {
    process.env.OPENCLAW_CONFIG = savedEnv.OPENCLAW_CONFIG;
    process.env.OPENCLAW_HOME = savedEnv.OPENCLAW_HOME;
  });

  it('defaults to ~/.openclaw', () => {
    expect(resolveOpenClawHome()).toBe(join(homedir(), '.openclaw'));
  });

  it('uses OPENCLAW_HOME when set', () => {
    process.env.OPENCLAW_HOME = '/custom/home';
    expect(resolveOpenClawHome()).toBe(resolve('/custom/home'));
  });

  it('uses dirname of OPENCLAW_CONFIG when set', () => {
    process.env.OPENCLAW_CONFIG = '/custom/path/openclaw.json';
    expect(resolveOpenClawHome()).toBe(
      dirname(resolve('/custom/path/openclaw.json')),
    );
  });

  it('OPENCLAW_CONFIG takes precedence over OPENCLAW_HOME', () => {
    process.env.OPENCLAW_CONFIG = '/config/path/openclaw.json';
    process.env.OPENCLAW_HOME = '/home/path';
    expect(resolveOpenClawHome()).toBe(
      dirname(resolve('/config/path/openclaw.json')),
    );
  });
});

describe('resolveConfigPath', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG;
    delete process.env.OPENCLAW_CONFIG;
  });

  afterEach(() => {
    process.env.OPENCLAW_CONFIG = savedEnv.OPENCLAW_CONFIG;
  });

  it('defaults to {home}/openclaw.json', () => {
    expect(resolveConfigPath('/my/home')).toBe(
      join('/my/home', 'openclaw.json'),
    );
  });

  it('uses OPENCLAW_CONFIG when set', () => {
    process.env.OPENCLAW_CONFIG = '/custom/openclaw.json';
    expect(resolveConfigPath('/ignored')).toBe(
      resolve('/custom/openclaw.json'),
    );
  });
});

describe('patchConfig', () => {
  it('adds plugin entry on install', () => {
    const config: Record<string, unknown> = {};
    const messages = patchConfig(config, 'my-plugin', 'add');

    const plugins = config.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;

    expect(entries['my-plugin']).toEqual({ enabled: true });
    expect(messages).toContain('Added "my-plugin" to plugins.entries');
  });

  it('is idempotent on add', () => {
    const config: Record<string, unknown> = {
      plugins: {
        entries: { 'my-plugin': { enabled: true } },
      },
      tools: { alsoAllow: ['my-plugin'] },
    };

    const messages = patchConfig(config, 'my-plugin', 'add');
    expect(messages).toHaveLength(0);
  });

  it('removes plugin entry on uninstall', () => {
    const config: Record<string, unknown> = {
      plugins: {
        entries: { 'my-plugin': { enabled: true }, other: { enabled: true } },
      },
    };

    const messages = patchConfig(config, 'my-plugin', 'remove');

    const plugins = config.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;

    expect(entries['my-plugin']).toBeUndefined();
    expect(entries.other).toBeDefined();
    expect(messages).toContain('Removed "my-plugin" from plugins.entries');
  });

  it('is idempotent on remove', () => {
    const config: Record<string, unknown> = {
      plugins: { entries: {} },
    };

    const messages = patchConfig(config, 'my-plugin', 'remove');
    expect(messages).toHaveLength(0);
  });

  it('creates tools.alsoAllow on fresh install', () => {
    const config: Record<string, unknown> = {};

    const messages = patchConfig(config, 'my-plugin', 'add');
    const tools = config.tools as Record<string, unknown>;
    const alsoAllow = tools.alsoAllow as string[];

    expect(alsoAllow).toContain('my-plugin');
    expect(messages).toContain('Created tools.alsoAllow with "my-plugin"');
  });

  it('appends to existing tools.alsoAllow', () => {
    const config: Record<string, unknown> = {
      tools: { alsoAllow: ['other-tool'] },
    };

    const messages = patchConfig(config, 'my-plugin', 'add');
    const tools = config.tools as Record<string, unknown>;
    const alsoAllow = tools.alsoAllow as string[];

    expect(alsoAllow).toEqual(['other-tool', 'my-plugin']);
    expect(messages).toContain('Added "my-plugin" to tools.alsoAllow');
  });

  it('does not duplicate in tools.alsoAllow', () => {
    const config: Record<string, unknown> = {
      plugins: {
        entries: { 'my-plugin': { enabled: true } },
      },
      tools: { alsoAllow: ['my-plugin'] },
    };

    const messages = patchConfig(config, 'my-plugin', 'add');
    const tools = config.tools as Record<string, unknown>;
    const alsoAllow = tools.alsoAllow as string[];

    expect(alsoAllow.filter((id) => id === 'my-plugin')).toHaveLength(1);
    expect(messages).toHaveLength(0);
  });

  it('removes from tools.alsoAllow on uninstall', () => {
    const config: Record<string, unknown> = {
      plugins: {
        entries: { 'my-plugin': { enabled: true } },
      },
      tools: { alsoAllow: ['my-plugin', 'other-tool'] },
    };

    const messages = patchConfig(config, 'my-plugin', 'remove');
    const tools = config.tools as Record<string, unknown>;
    const alsoAllow = tools.alsoAllow as string[];

    expect(alsoAllow).not.toContain('my-plugin');
    expect(alsoAllow).toContain('other-tool');
    expect(messages).toHaveLength(2); // entries, tools.alsoAllow
  });

  it('does not touch plugins.allow (not in spec)', () => {
    const config: Record<string, unknown> = {
      plugins: {
        allow: ['existing-plugin'],
        entries: {},
      },
    };

    patchConfig(config, 'my-plugin', 'add');
    const plugins = config.plugins as Record<string, unknown>;
    const allow = plugins.allow as string[];

    // plugins.allow should be untouched
    expect(allow).toEqual(['existing-plugin']);
  });
});
