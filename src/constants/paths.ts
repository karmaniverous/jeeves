/**
 * Directory and file path conventions for the Jeeves platform.
 */

/** Core config directory name within the config root. */
export const CORE_CONFIG_DIR = 'jeeves-core';

/** Prefix for component config directories: `jeeves-{name}`. */
export const COMPONENT_CONFIG_PREFIX = 'jeeves-';

/** Default workspace file names. */
export const WORKSPACE_FILES = {
  /** TOOLS.md — live platform state and component sections. */
  tools: 'TOOLS.md',
  /** SOUL.md — professional discipline and behavioral foundations. */
  soul: 'SOUL.md',
  /** AGENTS.md — operational protocols and memory architecture. */
  agents: 'AGENTS.md',
  /** HEARTBEAT.md — platform status and health alerts. */
  heartbeat: 'HEARTBEAT.md',
  /** MEMORY.md — curated long-term memory. */
  memory: 'MEMORY.md',
} as const;

/** Skill directory name within workspace. */
export const SKILLS_DIR = 'skills';

/** Jeeves skill directory name. */
export const JEEVES_SKILL_DIR = 'jeeves';

/** Templates directory name within core config. */
export const TEMPLATES_DIR = 'templates';

/** Registry cache file name. */
export const REGISTRY_CACHE_FILE = 'registry-cache.json';

/** Core config file name. */
export const CONFIG_FILE = 'config.json';

/** Component versions state file name. */
export const COMPONENT_VERSIONS_FILE = 'component-versions.json';
