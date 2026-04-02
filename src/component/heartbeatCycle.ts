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

import { WORKSPACE_FILES } from '../constants/paths.js';
import { parseHeartbeat, writeHeartbeatSection } from '../managed/heartbeat.js';
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

    await writeHeartbeatSection(heartbeatPath, entries);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`jeeves-core: HEARTBEAT orchestration failed: ${msg}`);
  }
}
