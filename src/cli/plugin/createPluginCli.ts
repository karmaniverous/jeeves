/**
 * Factory for the standard `-openclaw` plugin installer CLI.
 *
 * @remarks
 * Produces a Commander program with `install` and `uninstall` commands
 * that handle the full plugin lifecycle: copy dist to extensions,
 * patch OpenClaw config, manage HEARTBEAT entries, and clean up
 * managed sections on uninstall.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { Command } from '@commander-js/extra-typings';

import { removeComponentVersion } from '../../component/componentVersions.js';
import { TOOLS_MARKERS, WORKSPACE_FILES } from '../../constants/index.js';
import { getCoreConfigDir, init } from '../../init.js';
import { atomicWrite } from '../../managed/fileOps.js';
import {
  buildHeartbeatSection,
  parseHeartbeat,
} from '../../managed/heartbeat.js';
import { removeManagedSection } from '../../managed/removeManagedSection.js';
import {
  patchConfig,
  resolveConfigPath,
  resolveOpenClawHome,
} from '../../plugin/openclawConfig.js';

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
 * Derive a component name from a plugin ID.
 *
 * @remarks
 * Strips `jeeves-` prefix and `-openclaw` suffix.
 *
 * @param pluginId - The plugin identifier.
 * @returns Component short name.
 */
function deriveComponentName(pluginId: string): string {
  return pluginId.replace(/^jeeves-/, '').replace(/-openclaw$/, '');
}

/**
 * Copy all files from source directory to destination.
 *
 * @param srcDir - Source directory.
 * @param destDir - Destination directory.
 */
function copyDistFiles(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDistFiles(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Read and parse a JSON file, returning an empty object if not found.
 *
 * @param filePath - Path to the JSON file.
 * @returns Parsed object.
 */
function readJsonFile(filePath: string): Record<string, unknown> {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
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

      // 4. Write initial HEARTBEAT entry
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

            // Only add if not already present
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
        }
      } catch {
        // HEARTBEAT is best-effort during install
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
        const cfgRoot = opts.configRoot;
        const ws = opts.workspace;

        if (ws) {
          init({ workspacePath: ws, configRoot: cfgRoot });
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
        const cfgRoot = opts.configRoot;
        init({
          workspacePath: opts.workspace ?? '.',
          configRoot: cfgRoot,
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
