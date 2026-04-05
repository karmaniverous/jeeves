import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetInit } from '../../init';
import { createPluginCli } from './createPluginCli';

describe('createPluginCli', () => {
  let testDir: string;
  let distDir: string;
  let openClawHome: string;
  let importMetaUrl: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-plugincli-test-${String(Date.now())}`);
    distDir = join(testDir, 'dist');
    openClawHome = join(testDir, 'openclaw');
    importMetaUrl = pathToFileURL(join(distDir, 'cli.js')).href;

    mkdirSync(distDir, { recursive: true });
    mkdirSync(openClawHome, { recursive: true });

    // Create a sample dist file
    writeFileSync(join(distDir, 'index.js'), 'console.log("plugin");');

    // Create package.json and openclaw.plugin.json at package root (parent of dist)
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-plugin', version: '1.2.3' }),
    );
    writeFileSync(
      join(testDir, 'openclaw.plugin.json'),
      JSON.stringify({ id: 'jeeves-watcher-openclaw' }),
    );

    // Create package-root files that must not be copied into extensions
    writeFileSync(join(testDir, 'README.md'), '# test plugin\n');
    mkdirSync(join(testDir, 'content'), { recursive: true });
    writeFileSync(
      join(testDir, 'content', 'note.md'),
      'keep out of extensions',
    );

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
      importMetaUrl,
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
      importMetaUrl,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);

    const extDir = join(openClawHome, 'extensions', 'jeeves-watcher-openclaw');
    expect(existsSync(extDir)).toBe(true);
    expect(existsSync(join(extDir, 'dist', 'index.js'))).toBe(true);
  });

  it('install should preserve dist/ subdirectory and copy manifests to root', async () => {
    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      importMetaUrl,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);

    const extDir = join(openClawHome, 'extensions', 'jeeves-watcher-openclaw');

    // dist contents should be under dist/ subdirectory
    expect(existsSync(join(extDir, 'dist', 'index.js'))).toBe(true);
    // manifests should be at extension root
    expect(existsSync(join(extDir, 'package.json'))).toBe(true);
    expect(existsSync(join(extDir, 'openclaw.plugin.json'))).toBe(true);

    // package-root extras should NOT be copied
    expect(existsSync(join(extDir, 'README.md'))).toBe(false);
    expect(existsSync(join(extDir, 'content'))).toBe(false);
    // dist contents should NOT be at extension root
    expect(existsSync(join(extDir, 'index.js'))).toBe(false);
  });

  it('install should patch openclaw.json', async () => {
    // Create empty openclaw.json
    writeFileSync(join(openClawHome, 'openclaw.json'), JSON.stringify({}));

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      importMetaUrl,
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
      importMetaUrl,
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
      importMetaUrl,
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

  it('install should copy package.json and openclaw.plugin.json to extensions', async () => {
    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      importMetaUrl,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync(['node', 'test', 'install']);

    const extDir = join(openClawHome, 'extensions', 'jeeves-watcher-openclaw');
    // package.json should be copied from package root
    const pkgJsonPath = join(extDir, 'package.json');
    expect(existsSync(pkgJsonPath)).toBe(true);
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
      version: string;
    };
    expect(pkgJson.version).toBe('1.2.3');

    // openclaw.plugin.json should also be copied
    const pluginJsonPath = join(extDir, 'openclaw.plugin.json');
    expect(existsSync(pluginJsonPath)).toBe(true);
    const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8')) as {
      id: string;
    };
    expect(pluginJson.id).toBe('jeeves-watcher-openclaw');
  });

  it('install is idempotent', async () => {
    writeFileSync(join(openClawHome, 'openclaw.json'), JSON.stringify({}));

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      importMetaUrl,
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

  it('install should seed the jeeves workspace skill when workspace is provided', async () => {
    const workspaceDir = join(testDir, 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(openClawHome, 'openclaw.json'), JSON.stringify({}));

    const program = createPluginCli({
      pluginId: 'jeeves-watcher-openclaw',
      importMetaUrl,
      pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
    });

    await program.parseAsync([
      'node',
      'test',
      'install',
      '--workspace',
      workspaceDir,
      '--config-root',
      join(testDir, 'config'),
    ]);

    const skillPath = join(workspaceDir, 'skills', 'jeeves', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf-8')).toContain('Jeeves Platform Skill');
  });

  it('throws when package root cannot be resolved', () => {
    expect(() =>
      createPluginCli({
        pluginId: 'jeeves-watcher-openclaw',
        importMetaUrl: 'file:///nonexistent/path/cli.js',
        pluginPackage: '@karmaniverous/jeeves-watcher-openclaw',
      }),
    ).toThrow(/Unable to resolve package root/);
  });
});
