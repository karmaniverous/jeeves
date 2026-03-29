import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetInit } from '../../init';
import { createPluginCli } from './createPluginCli';

describe('createPluginCli', () => {
  let testDir: string;
  let distDir: string;
  let openClawHome: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-plugincli-test-${String(Date.now())}`);
    distDir = join(testDir, 'dist');
    openClawHome = join(testDir, 'openclaw');
    mkdirSync(distDir, { recursive: true });
    mkdirSync(openClawHome, { recursive: true });

    // Create a sample dist file
    writeFileSync(join(distDir, 'index.js'), 'console.log("plugin");');

    // Set env for openclaw home
    process.env.OPENCLAW_HOME = openClawHome;
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.OPENCLAW_HOME;
  });

  it('should create a CLI program with install and uninstall commands', () => {
    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    expect(program.name()).toBe('@karmaniverous/jeeves-watcher-openclaw');
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('install');
    expect(commands).toContain('uninstall');
  });

  it('install should copy dist files to extensions', async () => {
    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);

    const extDir = join(openClawHome, 'extensions', 'jeeves-watcher-openclaw');
    expect(existsSync(extDir)).toBe(true);
    expect(existsSync(join(extDir, 'index.js'))).toBe(true);
  });

  it('install should patch openclaw.json', async () => {
    // Create empty openclaw.json
    writeFileSync(join(openClawHome, 'openclaw.json'), JSON.stringify({}));

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);

    const config = JSON.parse(
      readFileSync(join(openClawHome, 'openclaw.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    expect(entries['jeeves-watcher-openclaw']).toBeDefined();
  });

  it('uninstall should remove extension files', async () => {
    // Set up extension
    const extDir = join(openClawHome, 'extensions', 'jeeves-watcher-openclaw');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, 'index.js'), 'plugin');

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'uninstall']);

    expect(existsSync(extDir)).toBe(false);
  });

  it('uninstall should unpatch openclaw.json', async () => {
    // Set up openclaw.json with plugin
    const configPath = join(openClawHome, 'openclaw.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        plugins: {
          entries: {
            'jeeves-watcher-openclaw': { enabled: true },
          },
        },
        tools: { alsoAllow: ['jeeves-watcher-openclaw'] },
      }),
    );

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'uninstall']);

    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const plugins = config.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, unknown>;
    expect(entries['jeeves-watcher-openclaw']).toBeUndefined();
  });

  it('install is idempotent', async () => {
    writeFileSync(join(openClawHome, 'openclaw.json'), JSON.stringify({}));

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      distDir,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);
    await program.parseAsync(['node', 'test', 'install']);

    const config = JSON.parse(
      readFileSync(join(openClawHome, 'openclaw.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const tools = config.tools as Record<string, unknown>;
    const alsoAllow = tools.alsoAllow as string[];
    const count = alsoAllow.filter(
      (id) => id === 'jeeves-watcher-openclaw',
    ).length;
    expect(count).toBe(1);
  });
});
