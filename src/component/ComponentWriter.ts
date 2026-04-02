/**
 * Timer-based orchestrator for managed content writing.
 *
 * @remarks
 * `ComponentWriter` manages a component's TOOLS.md section writes
 * and platform content maintenance (SOUL.md, AGENTS.md, Platform section)
 * on a configurable prime-interval timer cycle.
 */

import { join } from 'node:path';

import { CORE_VERSION, TOOLS_MARKERS } from '../constants/index.js';
import { WORKSPACE_FILES } from '../constants/paths.js';
import {
  getComponentConfigDir,
  getConfigRoot,
  getCoreConfigDir,
  getWorkspacePath,
} from '../init.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';
import { refreshPlatformContent } from '../platform/refreshPlatformContent.js';
import { scanAndEscalateCleanup } from './cleanupScan.js';
import type { JeevesComponentDescriptor } from './descriptor.js';
import { runHeartbeatCycle } from './heartbeatCycle.js';

/**
 * Orchestrates managed content writing for a single Jeeves component.
 *
 * @remarks
 * Created via `createComponentWriter()`. Manages a timer that fires
 * at the component's prime-interval, calling `generateToolsContent()`
 * and `refreshPlatformContent()` on each cycle.
 */

/** Options for ComponentWriter construction. */
export interface ComponentWriterOptions {
  /**
   * Gateway URL for cleanup escalation (e.g., 'http://localhost:3000').
   * When provided, the writer will attempt to spawn a cleanup session
   * via the gateway when orphaned content is detected.
   * When omitted, cleanup escalation is silently skipped.
   */
  gatewayUrl?: string;
}

export class ComponentWriter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly component: JeevesComponentDescriptor;
  private readonly configDir: string;
  private readonly gatewayUrl: string | undefined;
  private readonly pendingCleanups = new Set<string>();

  /** @internal */
  constructor(
    component: JeevesComponentDescriptor,
    options?: ComponentWriterOptions,
  ) {
    this.component = component;
    this.configDir = getComponentConfigDir(component.name);
    this.gatewayUrl = options?.gatewayUrl;
  }

  /** The component's config directory path. */
  get componentConfigDir(): string {
    return this.configDir;
  }

  /** Whether the writer timer is currently running. */
  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Start the writer timer.
   *
   * @remarks
   * Performs an immediate first write, then sets up the interval.
   */
  start(): void {
    if (this.timer) return;

    // Fire immediately, then on interval
    void this.cycle();
    this.timer = setInterval(
      () => void this.cycle(),
      this.component.refreshIntervalSeconds * 1000,
    );
  }

  /** Stop the writer timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Execute a single write cycle.
   *
   * @remarks
   * 1. Write the component's TOOLS.md section.
   * 2. Refresh shared platform content (SOUL.md, AGENTS.md, Platform section).
   * 3. Scan for cleanup flags and escalate if a gateway URL is configured.
   * 4. Run HEARTBEAT health orchestration.
   */
  async cycle(): Promise<void> {
    try {
      const workspacePath = getWorkspacePath();
      const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);

      // 1. Write the component's TOOLS.md section
      const toolsContent = this.component.generateToolsContent();
      await updateManagedSection(toolsPath, toolsContent, {
        mode: 'section',
        sectionId: this.component.sectionId,
        markers: TOOLS_MARKERS,
        coreVersion: CORE_VERSION,
      });

      // 2. Platform content maintenance
      await refreshPlatformContent({
        coreVersion: CORE_VERSION,
        componentName: this.component.name,
        componentVersion: this.component.version,
        servicePackage: this.component.servicePackage,
        pluginPackage: this.component.pluginPackage,
      });

      // 3. Cleanup escalation
      if (this.gatewayUrl) {
        scanAndEscalateCleanup(
          [
            { filePath: toolsPath, markerIdentity: 'TOOLS' },
            {
              filePath: join(workspacePath, WORKSPACE_FILES.soul),
              markerIdentity: 'SOUL',
            },
            {
              filePath: join(workspacePath, WORKSPACE_FILES.agents),
              markerIdentity: 'AGENTS',
            },
          ],
          this.gatewayUrl,
          this.pendingCleanups,
        );
      }

      // 4. HEARTBEAT orchestration
      await runHeartbeatCycle({
        workspacePath,
        coreConfigDir: getCoreConfigDir(),
        configRoot: getConfigRoot(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `jeeves-core: ComponentWriter cycle failed for ${this.component.name}: ${message}`,
      );
    }
  }
}
