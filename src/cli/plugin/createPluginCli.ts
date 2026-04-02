/**
 * Factory for the standard `-openclaw` plugin installer CLI.
 *
 * @module
 */

import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { packageDirectorySync } from 'package-directory';

import {
  removeComponentVersion,
  writeComponentVersion,
} from '../../component/componentVersions.js';
import { TOOLS_MARKERS, WORKSPACE_FILES } from '../../constants/index.js';
import { getCoreConfigDir, init } from '../../init.js';
import { atomicWrite } from '../../managed/fileOps.js';
import {
  buildHeartbeatSection,
  parseHeartbeat,
} from '../../managed/heartbeat.js';
import { removeManagedSection } from '../../managed/removeManagedSection.js';
import { seedSkill } from '../../platform/seedSkill.js';
import {
  patchConfig,
  resolveConfigPath,
  resolveOpenClawHome,
} from '../../plugin/openclawConfig.js';
import {
  copyDistFiles,
  deriveComponentName,
  readJsonFile,
} from './pluginCliHelpers.js';

/** Options for creating a plugin installer CLI. */
export interface CreatePluginCliOptions {
  /** Plugin identifier (e.g., 'jeeves-watcher-openclaw'). */
  pluginId: string;
  /** Absolute path to the dist directory to copy. */
  distDir: string;
  /** npm package name for the plugin. */
  pluginPackage: string;
  /** Component name (e.g., 'watcher'). Derived from pluginId if omitted. */
  componentName?: string;
  /** Workspace root (defaults to OpenClaw workspace). */
  workspace?: string;
  /** Config root (defaults to 'j:/config'). */
  configRoot?: string;
}

/**
 * Create a standard plugin installer CLI program.
 *
 * @param options - Plugin CLI configuration.
 * @returns A Commander program ready for `.parse()`.
 */
export function createPluginCli(options: CreatePluginCliOptions): Command {
  const {
    pluginId,
    distDir,
    pluginPackage,
    configRoot = 'j:/config',
  } = options;
  const componentName = options.componentName ?? deriveComponentName(pluginId);

  const program = new Command()
    .name(pluginPackage)
    .description(`Jeeves ${componentName} plugin installer`);

  program
    .command('install')
    .description(`Install the ${componentName} plugin`)
    .option('--memory', 'Claim a memory slot for this plugin')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path', configRoot)
    .action((opts) => {
      const openClawHome = resolveOpenClawHome();
      const configPath = resolveConfigPath(openClawHome);

      // 1. Copy dist to extensions
      const extensionsDir = join(openClawHome, 'extensions', pluginId);
      console.log(`Copying dist to ${extensionsDir}...`);
      copyDistFiles(distDir, extensionsDir);

      // Copy package.json and openclaw.plugin.json from package root
      const pkgRoot = packageDirectorySync({ cwd: distDir });
      if (pkgRoot) {
        for (const file of ['package.json', 'openclaw.plugin.json']) {
          const src = join(pkgRoot, file);
          if (existsSync(src)) {
            copyFileSync(src, join(extensionsDir, file));
          }
        }
      }
      console.log('  ✓ Dist files copied');

      // 2. Patch openclaw.json
      console.log('Patching OpenClaw config...');
      const config = readJsonFile(configPath);
      const messages = patchConfig(config, pluginId, 'add');

      // 3. Memory slot claim
      if (opts.memory) {
        if (!config.agents || typeof config.agents !== 'object') {
          config.agents = {};
        }
        const agents = config.agents as Record<string, unknown>;
        if (!agents.defaults || typeof agents.defaults !== 'object') {
          agents.defaults = {};
        }
        const defaults = agents.defaults as Record<string, unknown>;
        if (!defaults.memory || typeof defaults.memory !== 'object') {
          defaults.memory = {};
        }
        const memory = defaults.memory as Record<string, unknown>;
        if (!memory[componentName]) {
          memory[componentName] = {};
          messages.push(`Claimed memory slot for "${componentName}"`);
        }
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      for (const msg of messages) {
        console.log(`  ✓ ${msg}`);
      }

      // 4. Write initial HEARTBEAT entry and seed jeeves skill
      try {
        const cfgRoot = opts.configRoot;
        const agents = config.agents as Record<string, unknown> | undefined;
        const defaults = agents?.defaults as
          | Record<string, unknown>
          | undefined;
        const ws =
          opts.workspace ?? (defaults?.workspace as string | undefined);

        if (ws) {
          init({ workspacePath: ws, configRoot: cfgRoot });
          const heartbeatPath = join(ws, WORKSPACE_FILES.heartbeat);
          try {
            const existing = existsSync(heartbeatPath)
              ? readFileSync(heartbeatPath, 'utf-8')
              : '';
            const parsed = parseHeartbeat(existing);
            const fullName = `jeeves-${componentName}`;
            const hasEntry = parsed.entries.some((e) => e.name === fullName);
            if (!hasEntry) {
              parsed.entries.push({
                name: fullName,
                declined: false,
                content: `- Plugin installed. Awaiting service configuration.`,
              });
              const section = buildHeartbeatSection(parsed.entries);
              atomicWrite(heartbeatPath, section);
              console.log('  ✓ HEARTBEAT entry written');
            }
          } catch {
            console.log('  ⚠ Could not write HEARTBEAT entry');
          }

          try {
            seedSkill(ws);
            console.log('  ✓ Jeeves skill seeded');
          } catch {
            console.log('  ⚠ Could not seed Jeeves skill');
          }
        }
      } catch {
        // HEARTBEAT + skill seeding are best-effort during install
      }

      // 5. Write component version
      try {
        init({
          workspacePath: opts.workspace ?? '.',
          configRoot: opts.configRoot,
        });
        const pkgJsonPath = join(extensionsDir, 'package.json');
        const pkgJson = readJsonFile(pkgJsonPath);
        const pluginVersion =
          typeof pkgJson.version === 'string' ? pkgJson.version : undefined;
        writeComponentVersion(getCoreConfigDir(), {
          componentName,
          pluginPackage,
          pluginVersion,
        });
        console.log('  ✓ Component version written');
      } catch {
        console.log('  ⚠ Could not write component version');
      }

      console.log();
      console.log(`✅ ${pluginPackage} installed.`);
    });

  program
    .command('uninstall')
    .description(`Uninstall the ${componentName} plugin`)
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path', configRoot)
    .action(async (opts) => {
      const openClawHome = resolveOpenClawHome();
      const cfgPath = resolveConfigPath(openClawHome);

      // 1. Remove from extensions
      const extensionsDir = join(openClawHome, 'extensions', pluginId);
      if (existsSync(extensionsDir)) {
        rmSync(extensionsDir, { recursive: true, force: true });
        console.log('  ✓ Extension files removed');
      }

      // 2. Unpatch openclaw.json
      if (existsSync(cfgPath)) {
        const config = readJsonFile(cfgPath);
        const messages = patchConfig(config, pluginId, 'remove');
        writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n');
        for (const msg of messages) {
          console.log(`  ✓ ${msg}`);
        }
      }

      // 3. Remove TOOLS.md section
      try {
        const ws = opts.workspace;
        if (ws) {
          init({ workspacePath: ws, configRoot: opts.configRoot });
          const sectionId =
            componentName.charAt(0).toUpperCase() + componentName.slice(1);
          const toolsPath = join(ws, WORKSPACE_FILES.tools);
          if (existsSync(toolsPath)) {
            await removeManagedSection(toolsPath, {
              sectionId,
              markers: TOOLS_MARKERS,
            });
            console.log('  ✓ TOOLS.md section removed');
          }
        }
      } catch {
        console.log('  ⚠ Could not remove TOOLS.md section');
      }

      // 4. Remove component-versions.json entry
      try {
        init({
          workspacePath: opts.workspace ?? '.',
          configRoot: opts.configRoot,
        });
        removeComponentVersion(getCoreConfigDir(), componentName);
        console.log('  ✓ Component version entry removed');
      } catch {
        console.log('  ⚠ Could not remove component version entry');
      }

      console.log();
      console.log(`✅ ${pluginPackage} uninstalled.`);
    });

  return program;
}
