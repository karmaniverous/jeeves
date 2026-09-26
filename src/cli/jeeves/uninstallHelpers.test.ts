import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { LEGACY_TOOLS_MARKERS, SOUL_MARKERS } from '../../constants/index.js';
import { useTempDir } from '../../test/tempDir.js';
import { removePlatformArtifacts } from './uninstallHelpers.js';

let root: string;
let ws: string;
let cfg: string;

const tempDir = useTempDir('jeeves-uninstall-helpers-');
beforeEach(() => {
  root = tempDir();
  ws = join(root, 'ws');
  cfg = join(root, 'cfg');
  mkdirSync(join(ws, 'skills', 'jeeves'), { recursive: true });
  writeFileSync(join(ws, 'skills', 'jeeves', 'SKILL.md'), 'skill');
  mkdirSync(join(cfg, 'templates'), { recursive: true });
  writeFileSync(join(cfg, 'templates', 'spec.md'), 'spec');
  writeFileSync(join(cfg, 'config.json'), '{}');
  writeFileSync(join(cfg, 'config.schema.json'), '{}');
  writeFileSync(
    join(ws, 'SOUL.md'),
    `<!-- ${SOUL_MARKERS.begin} -->\nx\n<!-- ${SOUL_MARKERS.end} -->\n\nmine\n`,
  );
  writeFileSync(
    join(ws, 'TOOLS.md'),
    `notes\n\n<!-- ${LEGACY_TOOLS_MARKERS.begin} -->\nold\n<!-- ${LEGACY_TOOLS_MARKERS.end} -->\n`,
  );
});

describe('removePlatformArtifacts', () => {
  it('reports without changing anything on a dry run', () => {
    const soul = readFileSync(join(ws, 'SOUL.md'), 'utf-8');
    expect(removePlatformArtifacts(ws, cfg, true)).toEqual([
      'SOUL.md managed block',
      'TOOLS.md managed block',
      'config schema',
    ]);
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf-8')).toBe(soul);
    expect(existsSync(join(cfg, 'config.schema.json'))).toBe(true);
  });

  it('removes the artifacts, then finds nothing', () => {
    expect(removePlatformArtifacts(ws, cfg, false)).toHaveLength(3);
    expect(readFileSync(join(ws, 'SOUL.md'), 'utf-8')).toBe('mine\n');
    expect(readFileSync(join(ws, 'TOOLS.md'), 'utf-8')).toBe('notes\n');
    expect(existsSync(join(cfg, 'config.schema.json'))).toBe(false);
    expect(removePlatformArtifacts(ws, cfg, false)).toEqual([]);
    expect(
      readFileSync(join(ws, 'skills', 'jeeves', 'SKILL.md'), 'utf-8'),
    ).toBe('skill');
    expect(readFileSync(join(cfg, 'templates', 'spec.md'), 'utf-8')).toBe(
      'spec',
    );
    expect(existsSync(join(cfg, 'config.json'))).toBe(true);
  });
});
