/**
 * HEARTBEAT orchestration extracted from ComponentWriter.cycle().
 *
 * @remarks
 * Reads existing HEARTBEAT.md, resolves declined components, runs the
 * heartbeat state machine, and writes the result. Best-effort: failures
 * are logged but do not propagate.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadWorkspaceConfig,
  WORKSPACE_CONFIG_DEFAULTS,
} from '../config/workspaceConfig.js';
import { WORKSPACE_FILES } from '../constants/paths.js';
import { parseHeartbeat, writeHeartbeatSection } from '../managed/heartbeat.js';
import {
  checkMemoryHealth,
  MEMORY_HEARTBEAT_NAME,
} from '../memory/checkMemoryHealth.js';
import {
  checkWorkspaceFileHealth,
  workspaceFileHealthEntries,
} from '../memory/checkWorkspaceFileHealth.js';
import { orchestrateHeartbeat } from './heartbeatOrchestrator.js';

/** Options for running a heartbeat cycle. */
export interface HeartbeatCycleOptions {
  /** Workspace root path. */
  workspacePath: string;
  /** Core config directory. */
  coreConfigDir: string;
  /** Platform config root. */
  configRoot: string;
}

/**
 * Read a file's content, returning empty string if the file does not exist.
 *
 * @param filePath - Absolute file path.
 * @returns File content or empty string.
 */
function readFileOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return '';
    }
    throw err;
  }
}

/**
 * Run a single HEARTBEAT orchestration cycle.
 *
 * @param options - Heartbeat cycle configuration.
 */
export async function runHeartbeatCycle(
  options: HeartbeatCycleOptions,
): Promise<void> {
  const { workspacePath, coreConfigDir, configRoot } = options;
  const heartbeatPath = join(workspacePath, WORKSPACE_FILES.heartbeat);

  try {
    const existingContent = readFileOrEmpty(heartbeatPath);
    const parsed = parseHeartbeat(existingContent);
    const declinedNames = new Set(
      parsed.entries.filter((e) => e.declined).map((e) => e.name),
    );

    const entries = await orchestrateHeartbeat({
      coreConfigDir,
      configRoot,
      declinedNames,
    });

    // Memory hygiene check (Decision 49)
    if (!declinedNames.has(MEMORY_HEARTBEAT_NAME)) {
      const wsConfig = loadWorkspaceConfig(workspacePath);
      const memoryEntry = checkMemoryHealth({
        workspacePath,
        budget:
          wsConfig?.memory?.budget ?? WORKSPACE_CONFIG_DEFAULTS.memory.budget,
        warningThreshold:
          wsConfig?.memory?.warningThreshold ??
          WORKSPACE_CONFIG_DEFAULTS.memory.warningThreshold,
        staleDays:
          wsConfig?.memory?.staleDays ??
          WORKSPACE_CONFIG_DEFAULTS.memory.staleDays,
      });
      if (memoryEntry) entries.push(memoryEntry);
    } else {
      entries.push({
        name: MEMORY_HEARTBEAT_NAME,
        declined: true,
        content: '',
      });
    }

    // Workspace file size health check (Decision 70)
    const wsFileResults = checkWorkspaceFileHealth({ workspacePath });
    const wsFileAlerts = workspaceFileHealthEntries(wsFileResults);
    for (const alert of wsFileAlerts) {
      if (declinedNames.has(alert.name)) {
        entries.push({ name: alert.name, declined: true, content: '' });
      } else {
        entries.push(alert);
      }
    }

    await writeHeartbeatSection(heartbeatPath, entries);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`jeeves-core: HEARTBEAT orchestration failed: ${msg}`);
  }
}
