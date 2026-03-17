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
import { getComponentConfigDir, getWorkspacePath } from '../init.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';
import { refreshPlatformContent } from '../platform/refreshPlatformContent.js';
import type { JeevesComponent } from './types.js';

/**
 * Orchestrates managed content writing for a single Jeeves component.
 *
 * @remarks
 * Created via `createComponentWriter()`. Manages a timer that fires
 * at the component's prime-interval, calling `generateToolsContent()`
 * and `refreshPlatformContent()` on each cycle.
 */
export class ComponentWriter {
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly component: JeevesComponent;
  private readonly configDir: string;
  private readonly probeTimeoutMs: number;

  /** @internal */
  constructor(component: JeevesComponent, probeTimeoutMs = 3000) {
    this.component = component;
    this.configDir = getComponentConfigDir(component.name);
    this.probeTimeoutMs = probeTimeoutMs;
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
   * Calls `generateToolsContent()` and writes the component's
   * TOOLS.md section via `updateManagedSection()`. Also calls
   * `refreshPlatformContent()` for shared content maintenance.
   */
  async cycle(): Promise<void> {
    try {
      const workspacePath = getWorkspacePath();
      const toolsPath = join(workspacePath, WORKSPACE_FILES.tools);

      // Write the component's TOOLS.md section
      const toolsContent = this.component.generateToolsContent();
      await updateManagedSection(toolsPath, toolsContent, {
        mode: 'section',
        sectionId: this.component.sectionId,
        markers: TOOLS_MARKERS,
        coreVersion: CORE_VERSION,
      });

      // Platform content maintenance: SOUL.md, AGENTS.md, Platform section
      await refreshPlatformContent({
        coreVersion: CORE_VERSION,
        componentName: this.component.name,
        skipRegistryCheck: false,
        probeTimeoutMs: this.probeTimeoutMs,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `jeeves-core: ComponentWriter cycle failed for ${this.component.name}: ${message}`,
      );
    }
  }
}
