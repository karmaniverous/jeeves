import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SOUL_MARKERS } from '../../constants/index.js';
import { removePlatformArtifacts } from './uninstallHelpers.js';

let root: string;
let ws: string;
let cfg: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'jeeves-uninstall-helpers-'));
  ws = join(root, 'ws');
  cfg = join(root, 'cfg');
  mkdirSync(ws, { recursive: true });
  mkdirSync(join(cfg, 'templates'), { recursive: true });
  writeFileSync(join(cfg, 'config.schema.json'), '{}');
  writeFileSync(
    join(ws, 'SOUL.md'),
    `<!-- ${SOUL_MARKERS.begin} -->\nx\n<!-- ${SOUL_MARKERS.end} -->\n\nmine\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('removePlatformArtifacts', () => {
  it('reports without changing anything on a dry run', () => {
    expect(removePlatformArtifacts(ws, cfg, true)).toEqual([
      'SOUL.md managed block',
      'templates',
      'config schema',
    ]);
    expect(existsSync(join(cfg, 'templates'))).toBe(true);
    expect(existsSync(join(cfg, 'config.schema.json'))).toBe(true);
  });

  it('removes the artifacts, then finds nothing', () => {
    expect(removePlatformArtifacts(ws, cfg, false)).toHaveLength(3);
    expect(existsSync(join(cfg, 'templates'))).toBe(false);
    expect(existsSync(join(cfg, 'config.schema.json'))).toBe(false);
    expect(removePlatformArtifacts(ws, cfg, false)).toEqual([]);
  });
});
