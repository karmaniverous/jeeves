/**
 * Minimal validation of SKILL.md frontmatter (`name` and `description`).
 *
 * @remarks
 * OpenClaw skips skills without `name`/`description` frontmatter. Plugins
 * can call this from a build or test step to enforce it (runbook D4). Pure.
 *
 * @module
 */

/** Parsed required frontmatter fields. */
export interface SkillFrontmatter {
  /** Skill name. */
  name: string;
  /** Skill description (block scalars are folded to one line). */
  description: string;
}

/** Read a top-level scalar or block-scalar value from frontmatter lines. */
function readField(lines: string[], key: string): string | undefined {
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (idx < 0) return undefined;
  const inline = lines[idx].slice(key.length + 1).trim();
  if (inline && !/^[>|][+-]?$/.test(inline)) {
    return inline.replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  const block: string[] = [];
  for (const line of lines.slice(idx + 1)) {
    if (!/^\s+\S/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(' ').trim() || undefined;
}

/**
 * Validate that SKILL.md content carries non-empty `name` and `description`
 * frontmatter.
 *
 * @param content - Full SKILL.md content.
 * @returns The parsed fields.
 * @throws Error describing the first missing requirement.
 */
export function validateSkillFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter');
  const lines = match[1].split(/\r?\n/);
  const name = readField(lines, 'name');
  if (!name) throw new Error('SKILL.md frontmatter is missing "name"');
  const description = readField(lines, 'description');
  if (!description) {
    throw new Error('SKILL.md frontmatter is missing "description"');
  }
  return { name, description };
}
