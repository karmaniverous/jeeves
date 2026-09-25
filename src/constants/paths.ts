/**
 * Directory and file path conventions for the Jeeves platform.
 *
 * @module
 */

/** Core config directory name within the config root. */
export const CORE_CONFIG_DIR = 'jeeves-core';

/** Prefix for component config directories: `jeeves-{name}`. */
export const COMPONENT_CONFIG_PREFIX = 'jeeves-';

/** Workspace file names that Jeeves renders into or reads. */
export const WORKSPACE_FILES = {
  /** SOUL.md — professional discipline and behavioral foundations. */
  soul: 'SOUL.md',
  /** AGENTS.md — operational protocols. */
  agents: 'AGENTS.md',
  /** MEMORY.md — curated long-term memory. */
  memory: 'MEMORY.md',
  /**
   * TOOLS.md — legacy (v0.x) only. No longer loaded by OpenClaw and no longer
   * written by Jeeves; retained so tooling can strip legacy managed blocks.
   */
  legacyTools: 'TOOLS.md',
} as const;

/** Skills directory name within the workspace. */
export const SKILLS_DIR = 'skills';

/** Templates directory name within the core config directory. */
export const TEMPLATES_DIR = 'templates';

/** Core config file name. */
export const CONFIG_FILE = 'config.json';
