/**
 * Timer-based orchestrator for managed content writing.
 *
 * @remarks
 * `ComponentWriter` manages a component's TOOLS.md section writes
 * and platform content maintenance (SOUL.md, AGENTS.md, Platform section)
 * on a configurable prime-interval timer cycle.
 */

import { join } from 'node:path';

import { loadWorkspaceConfig } from '../config/workspaceConfig.js';
import { CORE_VERSION, TOOLS_MARKERS } from '../constants/index.js';
import { WORKSPACE_FILES } from '../constants/paths.js';
import {
  getComponentConfigDir,
  getConfigRoot,
  getCoreConfigDir,
  getWorkspacePath,
} from '../init.js';
import { withWorkspaceLock } from '../managed/fileOps.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';
import { refreshPlatformContent } from '../platform/refreshPlatformContent.js';
import { getErrorMessage } from '../utils.js';
import { scanAndEscalateCleanup } from './cleanupScan.js';
import type { JeevesComponentDescriptor } from './descriptor.js';
import { runHeartbeatCycle } from './heartbeatCycle.js';

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

/**
 * Orchestrates managed content writing for a single Jeeves component.
 *
 * @remarks
 * Created via {@link createComponentWriter}. Manages a timer that fires
 * at the component's prime-interval, calling `generateToolsContent()`
 * and `refreshPlatformContent()` on each cycle.
 */
export class ComponentWriter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private jitterTimeout: ReturnType<typeof setTimeout> | undefined;
  private readonly component: JeevesComponentDescriptor;
  private readonly configDir: string;
  private readonly gatewayUrl: string | undefined;
  private readonly pendingCleanups = new Set<string>();
  private cyclePromise: Promise<void> | undefined;
  private stopped = false;

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

  /** Whether the writer timer is currently running or pending its first cycle. */
  get isRunning(): boolean {
    return (
      this.jitterTimeout !== undefined ||
      this.timer !== undefined ||
      this.cyclePromise !== undefined
    );
  }

  /**
   * Start the writer timer.
   *
   * @remarks
   * Delays the first cycle by a random jitter (0 to one full interval) to
   * spread initial writes across all component plugins and reduce EPERM
   * contention on startup.
   */
  start(): void {
    if (this.isRunning) return;

    this.stopped = false;

    // Random jitter up to one full interval to spread initial writes
    const intervalMs = this.component.refreshIntervalSeconds * 1000;
    const jitterMs = Math.floor(Math.random() * intervalMs);
    this.jitterTimeout = setTimeout(() => {
      this.jitterTimeout = undefined;
      this.scheduleNextCycle(0, intervalMs);
    }, jitterMs);
  }

  /** Stop the writer timer. */
  stop(): void {
    this.stopped = true;
    if (this.jitterTimeout) {
      clearTimeout(this.jitterTimeout);
      this.jitterTimeout = undefined;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNextCycle(delayMs: number, intervalMs: number): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.cycle().finally(() => {
        if (!this.stopped) this.scheduleNextCycle(intervalMs, intervalMs);
      });
    }, delayMs);
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
    if (this.cyclePromise) return this.cyclePromise;

    this.cyclePromise = this.runCycle().finally(() => {
      this.cyclePromise = undefined;
    });

    return this.cyclePromise;
  }

  private async runCycle(): Promise<void> {
    try {
      const workspacePath = getWorkspacePath();
      const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);

      await withWorkspaceLock(workspacePath, async () => {
        // 1. Write the component's TOOLS.md section
        const toolsContent = this.component.generateToolsContent();
        await updateManagedSection(toolsPath, toolsContent, {
          mode: 'section',
          sectionId: this.component.sectionId,
          markers: TOOLS_MARKERS,
          coreVersion: CORE_VERSION,
        });

        // 2. Load workspace config once for the entire cycle
        const workspaceConfig = loadWorkspaceConfig(workspacePath);

        // 3. Platform content maintenance
        await refreshPlatformContent({
          coreVersion: CORE_VERSION,
          componentName: this.component.name,
          componentVersion: this.component.version,
          servicePackage: this.component.servicePackage,
          pluginPackage: this.component.pluginPackage,
          workspaceConfig: workspaceConfig ?? undefined,
        });

        // 4. Cleanup escalation
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

        // 5. HEARTBEAT orchestration
        await runHeartbeatCycle({
          workspacePath,
          coreConfigDir: getCoreConfigDir(),
          configRoot: getConfigRoot(),
          workspaceConfig: workspaceConfig ?? undefined,
        });
      });
    } catch (err: unknown) {
      console.warn(
        `jeeves-core: ComponentWriter cycle failed for ${this.component.name}: ${getErrorMessage(err)}`,
      );
    }
  }
}
