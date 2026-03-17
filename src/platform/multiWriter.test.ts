/**
 * Multi-writer simulation: two writers with different core versions,
 * verify version-stamp convergence without oscillation.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SOUL_MARKERS, TOOLS_MARKERS } from '../constants/index.js';
import { init, resetInit } from '../init.js';
import { parseManaged } from '../managed/parseManaged.js';
import { updateManagedSection } from '../managed/updateManagedSection.js';

describe('multi-writer convergence', () => {
  let testDir: string;
  let workspaceDir: string;
  let configDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-mw-${String(Date.now())}`);
    workspaceDir = join(testDir, 'workspace');
    configDir = join(testDir, 'config');
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    init({ workspacePath: workspaceDir, configRoot: configDir });
  });

  afterEach(() => {
    resetInit();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('newer version wins over older version', async () => {
    const filePath = join(workspaceDir, 'SOUL.md');
    writeFileSync(filePath, '', 'utf-8');

    // Writer A: core version 0.1.0 writes first
    await updateManagedSection(filePath, 'Content from v0.1.0', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.1.0',
    });

    let content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Content from v0.1.0');
    expect(content).toContain('core:0.1.0');

    // Writer B: core version 0.2.0 writes second — should win
    await updateManagedSection(filePath, 'Content from v0.2.0', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.2.0',
    });

    content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Content from v0.2.0');
    expect(content).toContain('core:0.2.0');

    // Writer A: tries to write again — should skip (older version, fresh stamp)
    await updateManagedSection(filePath, 'Content from v0.1.0 again', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.1.0',
    });

    content = readFileSync(filePath, 'utf-8');
    // v0.2.0 content should still be there
    expect(content).toContain('Content from v0.2.0');
    expect(content).not.toContain('Content from v0.1.0 again');
  });

  it('same version writers converge without oscillation', async () => {
    const filePath = join(workspaceDir, 'TOOLS.md');
    writeFileSync(filePath, '', 'utf-8');

    // Writer A writes Platform section
    await updateManagedSection(filePath, 'Platform from A', {
      mode: 'section',
      sectionId: 'Platform',
      markers: TOOLS_MARKERS,
      coreVersion: '0.1.0',
    });

    // Writer B writes Watcher section (same version)
    await updateManagedSection(filePath, 'Watcher from B', {
      mode: 'section',
      sectionId: 'Watcher',
      markers: TOOLS_MARKERS,
      coreVersion: '0.1.0',
    });

    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseManaged(content, TOOLS_MARKERS);
    expect(parsed.found).toBe(true);

    // Both sections should be present
    const platform = parsed.sections.find((s) => s.id === 'Platform');
    const watcher = parsed.sections.find((s) => s.id === 'Watcher');
    expect(platform?.content).toBe('Platform from A');
    expect(watcher?.content).toBe('Watcher from B');
  });

  it('older writer takes over when newer writer becomes stale', async () => {
    const filePath = join(workspaceDir, 'SOUL.md');
    writeFileSync(filePath, '', 'utf-8');

    // Writer B (newer) writes
    await updateManagedSection(filePath, 'Content from v0.2.0', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.2.0',
    });

    // Writer A (older) tries with a very low staleness threshold (0ms)
    // This simulates the newer writer's plugin being uninstalled
    await updateManagedSection(filePath, 'Content from v0.1.0 fallback', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.1.0',
      stalenessThresholdMs: 0, // Treat everything as stale
    });

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Content from v0.1.0 fallback');
  });

  it('user content preserved across multi-writer cycles', async () => {
    const filePath = join(workspaceDir, 'SOUL.md');
    writeFileSync(
      filePath,
      '# My Persona\n\nI am unique and creative.\n',
      'utf-8',
    );

    // Writer A writes
    await updateManagedSection(filePath, 'Managed content A', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.1.0',
    });

    let content = readFileSync(filePath, 'utf-8');
    let parsed = parseManaged(content, SOUL_MARKERS);
    expect(parsed.userContent).toContain('I am unique and creative.');

    // Writer B writes (newer version)
    await updateManagedSection(filePath, 'Managed content B', {
      mode: 'block',
      markers: SOUL_MARKERS,
      coreVersion: '0.2.0',
    });

    content = readFileSync(filePath, 'utf-8');
    parsed = parseManaged(content, SOUL_MARKERS);
    expect(parsed.userContent).toContain('I am unique and creative.');
    expect(parsed.managedContent).toContain('Managed content B');
  });

  it('no oscillation with rapid alternating writes', async () => {
    const filePath = join(workspaceDir, 'TOOLS.md');
    writeFileSync(filePath, '', 'utf-8');

    // Simulate rapid alternating writes from two components
    for (let i = 0; i < 5; i++) {
      await updateManagedSection(filePath, `Watcher cycle ${String(i)}`, {
        mode: 'section',
        sectionId: 'Watcher',
        markers: TOOLS_MARKERS,
        coreVersion: '0.1.0',
      });

      await updateManagedSection(filePath, `Runner cycle ${String(i)}`, {
        mode: 'section',
        sectionId: 'Runner',
        markers: TOOLS_MARKERS,
        coreVersion: '0.1.0',
      });
    }

    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseManaged(content, TOOLS_MARKERS);

    // Both sections should have their latest content
    const watcher = parsed.sections.find((s) => s.id === 'Watcher');
    const runner = parsed.sections.find((s) => s.id === 'Runner');
    expect(watcher?.content).toBe('Watcher cycle 4');
    expect(runner?.content).toBe('Runner cycle 4');

    // Sections should be in stable order (Watcher before Runner)
    const watcherIdx = parsed.sections.findIndex((s) => s.id === 'Watcher');
    const runnerIdx = parsed.sections.findIndex((s) => s.id === 'Runner');
    expect(watcherIdx).toBeLessThan(runnerIdx);
  });
});
