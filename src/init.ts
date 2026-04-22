/**
 * Workspace and config root initialization.
 *
 * @remarks
 * `init()` must be called once before any other core library functions.
 * It caches `workspacePath` and `configRoot` at module level.
 * Core derives all namespaced paths from these values:
 * - `{configRoot}/jeeves-core/` for core config
 * - `{configRoot}/jeeves-{name}/` for each component
 */

import { join } from 'node:path';

import {
  COMPONENT_CONFIG_PREFIX,
  CONFIG_FILE,
  CORE_CONFIG_DIR,
} from './constants/index.js';

/** Options for initializing the core library. */
export interface InitOptions {
  /** Absolute path to the OpenClaw workspace root. */
  workspacePath: string;
  /** Absolute path to the platform config root (e.g., `j:/config`). */
  configRoot: string;
}

/** Cached initialization state. */
interface InitState {
  workspacePath: string;
  configRoot: string;
  coreConfigDir: string;
  /** Per-component config file path overrides (absolute paths). */
  componentConfigPaths: Map<string, string>;
}

let state: InitState | undefined;

/**
 * Initialize the core library with workspace and config root paths.
 *
 * @param options - Workspace and config root paths.
 */
export function init(options: InitOptions): void {
  state = {
    workspacePath: options.workspacePath,
    configRoot: options.configRoot,
    coreConfigDir: join(options.configRoot, CORE_CONFIG_DIR),
    componentConfigPaths: new Map(),
  };
}

/**
 * Get the cached workspace path.
 *
 * @throws Error if `init()` has not been called.
 */
export function getWorkspacePath(): string {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return state.workspacePath;
}

/**
 * Get the cached config root path.
 *
 * @throws Error if `init()` has not been called.
 */
export function getConfigRoot(): string {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return state.configRoot;
}

/**
 * Get the core config directory path.
 *
 * @throws Error if `init()` has not been called.
 */
export function getCoreConfigDir(): string {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return state.coreConfigDir;
}

/**
 * Get the core config file path.
 *
 * @throws Error if `init()` has not been called.
 */
export function getCoreConfigFile(): string {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return join(state.coreConfigDir, CONFIG_FILE);
}

/**
 * Derive the component config directory from the component name.
 *
 * @param componentName - The component name (e.g., 'watcher', 'runner').
 * @returns Absolute path to the component's config directory.
 * @throws Error if `init()` has not been called.
 */
export function getComponentConfigDir(componentName: string): string {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return join(state.configRoot, `${COMPONENT_CONFIG_PREFIX}${componentName}`);
}

/**
 * Register the actual config file path for a component.
 *
 * @remarks
 * Call this after resolving the `--config` CLI argument so that
 * `getComponentConfigPath` returns the real file location instead of
 * the default derived from `configRoot`.
 *
 * @param componentName - The component name (e.g., 'watcher', 'runner').
 * @param absolutePath - Absolute path to the component's config file.
 * @throws Error if `init()` has not been called.
 */
export function registerComponentConfigPath(
  componentName: string,
  absolutePath: string,
): void {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  state.componentConfigPaths.set(componentName, absolutePath);
}

/**
 * Get the registered config file path for a component, or `undefined`
 * if no override has been registered.
 *
 * @param componentName - The component name.
 * @returns The registered absolute path, or `undefined`.
 * @throws Error if `init()` has not been called.
 */
export function getComponentConfigPath(
  componentName: string,
): string | undefined {
  if (!state) throw new Error('jeeves-core: init() must be called first');
  return state.componentConfigPaths.get(componentName);
}

/**
 * Reset initialization state. Used for testing only.
 */
export function resetInit(): void {
  state = undefined;
}
