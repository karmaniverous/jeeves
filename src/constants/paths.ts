/**
 * Directory and file path conventions for the Jeeves platform.
 */

/** Core config directory name within the config root. */
export const CORE_CONFIG_DIR = 'jeeves-core';

/** Prefix for component config directories: `jeeves-{name}`. */
export const COMPONENT_CONFIG_PREFIX = 'jeeves-';

/** Default workspace file names. */
export const WORKSPACE_FILES = {
  tools: 'TOOLS.md',
  soul: 'SOUL.md',
  agents: 'AGENTS.md',
} as const;

/** Templates directory name within core config. */
export const TEMPLATES_DIR = 'templates';

/** Registry cache file name. */
export const REGISTRY_CACHE_FILE = 'registry-cache.json';

/** Core config file name. */
export const CONFIG_FILE = 'config.json';
