import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultShadowSources, findShadows } from './skillsShadow.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'jeeves-shadow-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write `<dir>/SKILL.md`, with frontmatter naming `name` unless omitted. */
function skill(dir: string, name?: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'SKILL.md'),
    name === undefined
      ? '# no frontmatter\n'
      : `---\nname: ${name}\ndescription: test skill\n---\n\n# ${name}\n`,
  );
}

describe('findShadows', () => {
  it('maps each shipped skill to every other source providing it', () => {
    const ws = path.join(root, 'ws');
    const managed = path.join(root, 'managed');
    skill(path.join(ws, 'jeeves-platform'), 'jeeves-platform');
    skill(path.join(managed, 'jeeves-platform'), 'jeeves-platform');
    skill(path.join(managed, 'unrelated'), 'unrelated');

    expect(
      findShadows(
        ['jeeves-platform', 'jeeves-coding'],
        [
          { label: 'workspace skills/', dir: ws },
          { label: 'managed', dir: managed },
        ],
      ),
    ).toEqual({ 'jeeves-platform': ['workspace skills/', 'managed'] });
  });
});

describe('defaultShadowSources', () => {
  it('lists OpenClaw sources in precedence order, then other extraDirs', () => {
    const home = path.join(root, 'home');
    const state = path.join(root, 'state');
    mkdirSync(path.join(state, 'agents', 'main'), { recursive: true });

    const sources = defaultShadowSources({
      workspace: path.join(root, 'ws'),
      extraDirs: ['/own/skills', '/other/skills'],
      isOwnEntry: (entry) => entry === '/own/skills',
      env: { OPENCLAW_STATE_DIR: state },
      home,
    });

    expect(sources.map((s) => s.dir)).toEqual([
      path.join(root, 'ws', 'skills'),
      path.join(root, 'ws', '.agents', 'skills'),
      path.join(home, '.agents', 'skills'),
      path.join(state, 'skills'),
      path.join(state, 'agents', 'main', 'agent', 'workshop-skills'),
      '/other/skills',
      path.join(state, 'plugin-skills'),
    ]);
    expect(sources[4].label).toBe('workshop skills (agent main)');
    expect(sources[5].label).toBe('extraDirs entry /other/skills');
    expect(sources[6].label).toBe(
      `plugin skills (${path.join(state, 'plugin-skills')})`,
    );
  });
});
