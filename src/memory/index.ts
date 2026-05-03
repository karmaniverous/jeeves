/**
 * Memory hygiene analysis for MEMORY.md.
 *
 * @packageDocumentation
 */

export {
  checkMemoryHealth,
  MEMORY_HEARTBEAT_NAME,
} from './checkMemoryHealth.js';
export {
  checkWorkspaceFileHealth,
  WORKSPACE_SIZE_FILES,
  workspaceFileHealthEntries,
  type WorkspaceFileHealthOptions,
  type WorkspaceFileHealthResult,
} from './checkWorkspaceFileHealth.js';
export {
  analyzeMemory,
  type MemoryHygieneOptions,
  type MemoryHygieneResult,
} from './memoryHygiene.js';
