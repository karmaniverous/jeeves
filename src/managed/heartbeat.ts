/**
 * Heading-based HEARTBEAT section writer.
 *
 * @remarks
 * Manages the `# Jeeves Platform Status` section in HEARTBEAT.md.
 * Unlike TOOLS/SOUL/AGENTS (which use HTML comment markers), HEARTBEAT
 * uses markdown headings as markers — this ensures the file passes
 * OpenClaw's heartbeat emptiness check when only headings remain.
 *
 * The section is always at the bottom of the file (H1 to EOF).
 * User heartbeat items above the section are preserved.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { atomicWrite, withFileLock } from './fileOps.js';

/** The H1 heading that anchors the platform status section. */
export const HEARTBEAT_HEADING = '# Jeeves Platform Status';

/** A single component entry in the HEARTBEAT section. */
export interface HeartbeatEntry {
  /** Component name (e.g., 'runner', 'watcher'). */
  name: string;
  /** Whether the component is declined. */
  declined: boolean;
  /** Alert content (list items). Empty string if healthy or declined. */
  content: string;
}

/** Result of parsing the HEARTBEAT section. */
export interface ParsedHeartbeat {
  /** Content above the `# Jeeves Platform Status` heading (user zone). */
  userContent: string;
  /** Whether the heading was found. */
  found: boolean;
  /** Parsed component entries. */
  entries: HeartbeatEntry[];
}

/**
 * Parse the HEARTBEAT.md file content.
 *
 * @param fileContent - Full file content.
 * @returns Parsed result with user zone and component entries.
 */
export function parseHeartbeat(fileContent: string): ParsedHeartbeat {
  const headingIndex = fileContent.indexOf(HEARTBEAT_HEADING);

  if (headingIndex === -1) {
    return {
      userContent: fileContent.trim(),
      found: false,
      entries: [],
    };
  }

  const userContent = fileContent.slice(0, headingIndex).trim();
  const sectionContent = fileContent.slice(
    headingIndex + HEARTBEAT_HEADING.length,
  );

  const entries: HeartbeatEntry[] = [];
  const h2Re = /^## (jeeves-\S+?)(?:: declined)?$/gm;
  let match: RegExpExecArray | null;
  const h2Positions: { name: string; declined: boolean; start: number }[] = [];

  while ((match = h2Re.exec(sectionContent)) !== null) {
    const fullHeading = match[0];
    const name = match[1];
    const declined = fullHeading.endsWith(': declined');
    h2Positions.push({ name, declined, start: match.index });
  }

  for (let i = 0; i < h2Positions.length; i++) {
    const pos = h2Positions[i];
    const headingLine = pos.declined
      ? `## ${pos.name}: declined`
      : `## ${pos.name}`;
    const contentStart = pos.start + headingLine.length;
    const contentEnd =
      i + 1 < h2Positions.length
        ? h2Positions[i + 1].start
        : sectionContent.length;
    const content = sectionContent.slice(contentStart, contentEnd).trim();

    entries.push({
      name: pos.name,
      declined: pos.declined,
      content,
    });
  }

  return { userContent, found: true, entries };
}

/**
 * Build the HEARTBEAT section content from entries.
 *
 * @param entries - Component entries to write.
 * @returns The full section string (H1 + H2s).
 */
export function buildHeartbeatSection(entries: HeartbeatEntry[]): string {
  const parts: string[] = [HEARTBEAT_HEADING];

  for (const entry of entries) {
    if (entry.declined) {
      parts.push(`## ${entry.name}: declined`);
    } else if (entry.content) {
      parts.push(`## ${entry.name}`);
      parts.push(entry.content);
    }
    // Healthy components (no content, not declined) get no H2 section
  }

  return parts.join('\n');
}

/**
 * Write the HEARTBEAT section to a file.
 *
 * @remarks
 * Replaces everything from `# Jeeves Platform Status` to EOF.
 * Preserves user content above the heading. Uses file-level locking.
 *
 * @param filePath - Absolute path to HEARTBEAT.md.
 * @param entries - Component entries to write.
 */
export async function writeHeartbeatSection(
  filePath: string,
  entries: HeartbeatEntry[],
): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    writeFileSync(filePath, '', 'utf-8');
  }

  try {
    await withFileLock(filePath, () => {
      const fileContent = readFileSync(filePath, 'utf-8');
      const parsed = parseHeartbeat(fileContent);

      const section = buildHeartbeatSection(entries);

      const parts: string[] = [];
      if (parsed.userContent) {
        parts.push(parsed.userContent);
        parts.push('');
      }
      parts.push(section);
      parts.push('');

      atomicWrite(filePath, parts.join('\n'));
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `jeeves-core: writeHeartbeatSection failed for ${filePath}: ${message}`,
    );
  }
}
