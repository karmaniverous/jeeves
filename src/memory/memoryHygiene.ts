/**
 * Memory budget accounting and staleness detection for MEMORY.md.
 *
 * @remarks
 * Scans MEMORY.md for ISO date patterns in H2/H3 headings and bullet items.
 * Reports character count against a configured budget, warning threshold state,
 * and stale section candidates. Does not auto-delete: review remains
 * human- or agent-mediated (Decision 42).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WORKSPACE_FILES } from '../constants/paths.js';

/** ISO date pattern: YYYY-MM-DD. */
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/g;

/** H2 heading pattern used to split sections. */
const H2_RE = /^## /m;

/** Result of memory hygiene analysis. */
export interface MemoryHygieneResult {
  /** Whether MEMORY.md exists. */
  exists: boolean;
  /** Total character count. */
  charCount: number;
  /** Configured budget in characters. */
  budget: number;
  /** Usage as a fraction of budget (0–1+). */
  usage: number;
  /** Whether usage exceeds the warning threshold. */
  warning: boolean;
  /** Whether usage exceeds the budget. */
  overBudget: boolean;
  /** Number of H2 sections flagged as stale candidates. */
  staleCandidates: number;
  /** Names of stale sections. */
  staleSectionNames: string[];
}

/** Options for memory hygiene analysis. */
export interface MemoryHygieneOptions {
  /** Workspace root path. */
  workspacePath: string;
  /** Character budget. */
  budget: number;
  /** Warning threshold as a fraction of budget (0–1). */
  warningThreshold: number;
  /** Staleness threshold in days. */
  staleDays: number;
}

/**
 * Extract the most recent ISO date from a string.
 *
 * @param text - Text to scan for dates.
 * @returns The most recent date found, or undefined.
 */
export function extractMostRecentDate(text: string): Date | undefined {
  const matches = text.match(ISO_DATE_RE);
  if (!matches) return undefined;

  let latest: Date | undefined;
  for (const match of matches) {
    const d = new Date(match + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime())) {
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

/**
 * Analyze MEMORY.md for budget and staleness.
 *
 * @param options - Analysis configuration.
 * @returns Memory hygiene result.
 */
export function analyzeMemory(
  options: MemoryHygieneOptions,
): MemoryHygieneResult {
  const { workspacePath, budget, warningThreshold, staleDays } = options;
  const memoryPath = join(workspacePath, WORKSPACE_FILES.memory);

  if (!existsSync(memoryPath)) {
    return {
      exists: false,
      charCount: 0,
      budget,
      usage: 0,
      warning: false,
      overBudget: false,
      staleCandidates: 0,
      staleSectionNames: [],
    };
  }

  const content = readFileSync(memoryPath, 'utf-8');
  const charCount = content.length;
  const usage = budget > 0 ? charCount / budget : charCount > 0 ? Infinity : 0;
  const warning = usage >= warningThreshold;
  const overBudget = usage > 1;

  // Split into H2 sections and scan for staleness
  const sections = content.split(H2_RE).slice(1); // skip content before first H2
  const now = Date.now();
  const thresholdMs = staleDays * 24 * 60 * 60 * 1000;
  const staleSectionNames: string[] = [];

  for (const section of sections) {
    const sectionName = section.split('\n')[0]?.trim() ?? '';
    const recentDate = extractMostRecentDate(section);

    // Sections without dates are evergreen — never flagged (Decision 47)
    if (!recentDate) continue;

    if (now - recentDate.getTime() > thresholdMs) {
      staleSectionNames.push(sectionName);
    }
  }

  return {
    exists: true,
    charCount,
    budget,
    usage,
    warning,
    overBudget,
    staleCandidates: staleSectionNames.length,
    staleSectionNames,
  };
}
