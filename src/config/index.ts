/**
 * Workspace-level shared configuration.
 *
 * @packageDocumentation
 */

export {
  type ConfigProvenance,
  generateWorkspaceJsonSchema,
  loadWorkspaceConfig,
  resolveConfigValue,
  type ResolvedValue,
  WORKSPACE_CONFIG_DEFAULTS,
  WORKSPACE_CONFIG_FILE,
  type WorkspaceConfig,
  workspaceConfigSchema,
} from './workspaceConfig.js';
