import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  checkWorkspaceFileHealth,
  WORKSPACE_SIZE_FILES,
  workspaceFileHealthEntries,
} from './checkWorkspaceFileHealth.js';

describe('checkWorkspaceFileHealth', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `jeeves-ws-health-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reports no warning for files under threshold', () => {
    writeFileSync(join(testDir, 'AGENTS.md'), 'a'.repeat(10_000));
    writeFileSync(join(testDir, 'SOUL.md'), 'b'.repeat(5_000));

    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
      budgetChars: 20_000,
      warningThreshold: 0.8,
    });

    const agents = results.find((r) => r.file === 'AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.warning).toBe(false);
    expect(agents!.overBudget).toBe(false);
    expect(agents!.usage).toBe(0.5);

    const soul = results.find((r) => r.file === 'SOUL.md');
    expect(soul).toBeDefined();
    expect(soul!.warning).toBe(false);
  });

  it('reports warning at 80% threshold', () => {
    writeFileSync(join(testDir, 'TOOLS.md'), 'c'.repeat(16_000));

    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
      budgetChars: 20_000,
      warningThreshold: 0.8,
    });

    const tools = results.find((r) => r.file === 'TOOLS.md');
    expect(tools).toBeDefined();
    expect(tools!.warning).toBe(true);
    expect(tools!.overBudget).toBe(false);
    expect(tools!.usage).toBe(0.8);
  });

  it('reports over-budget when file exceeds budget', () => {
    writeFileSync(join(testDir, 'AGENTS.md'), 'd'.repeat(25_000));

    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
      budgetChars: 20_000,
      warningThreshold: 0.8,
    });

    const agents = results.find((r) => r.file === 'AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.warning).toBe(true);
    expect(agents!.overBudget).toBe(true);
    expect(agents!.usage).toBe(1.25);
  });

  it('skips non-existent files without error', () => {
    // Don't create any files — all should be marked as not existing
    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
    });

    expect(results).toHaveLength(WORKSPACE_SIZE_FILES.length);
    for (const result of results) {
      expect(result.exists).toBe(false);
      expect(result.charCount).toBe(0);
      expect(result.warning).toBe(false);
      expect(result.overBudget).toBe(false);
    }
  });

  it('generates multiple HEARTBEAT entries for multiple over-threshold files', () => {
    writeFileSync(join(testDir, 'AGENTS.md'), 'a'.repeat(18_000));
    writeFileSync(join(testDir, 'SOUL.md'), 'b'.repeat(17_000));
    writeFileSync(join(testDir, 'TOOLS.md'), 'c'.repeat(5_000));

    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
      budgetChars: 20_000,
      warningThreshold: 0.8,
    });

    const heartbeatEntries = workspaceFileHealthEntries(results);
    expect(heartbeatEntries).toHaveLength(2);

    const names = heartbeatEntries.map((e) => e.name);
    expect(names).toContain('AGENTS.md');
    expect(names).toContain('SOUL.md');
    expect(names).not.toContain('TOOLS.md');

    // Each entry should contain trimming guidance
    for (const entry of heartbeatEntries) {
      expect(entry.content).toContain('Trim to stay under');
      expect(entry.content).toContain('Move domain-specific content');
    }
  });

  it('generates over-budget note in HEARTBEAT entry', () => {
    writeFileSync(join(testDir, 'AGENTS.md'), 'a'.repeat(25_000));

    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
      budgetChars: 20_000,
      warningThreshold: 0.8,
    });

    const heartbeatEntries = workspaceFileHealthEntries(results);
    expect(heartbeatEntries).toHaveLength(1);
    expect(heartbeatEntries[0].content).toContain('**Over budget.**');
  });

  it('does not generate HEARTBEAT entries for non-existent files', () => {
    const results = checkWorkspaceFileHealth({
      workspacePath: testDir,
    });

    const heartbeatEntries = workspaceFileHealthEntries(results);
    expect(heartbeatEntries).toHaveLength(0);
  });
});
