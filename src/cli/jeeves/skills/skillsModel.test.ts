import { describe, expect, it } from 'vitest';

import type { SkillsFolders } from './skillsFolders.js';
import {
  inferMode,
  installChange,
  resolveModeFlag,
  type SkillsContext,
  statusLines,
  uninstallChange,
} from './skillsModel.js';

const folders: SkillsFolders = {
  generic: '/pkg/skills',
  selfHosted: '/pkg/skills-self-hosted',
};

const staleGeneric = '/old/node_modules/@karmaniverous/jeeves/skills';
const staleSelfHosted =
  '/old/node_modules/@karmaniverous/jeeves/skills-self-hosted';

const ctx = (extraDirs?: string[]): SkillsContext => ({
  folders,
  config: extraDirs ? { load: { extraDirs } } : {},
});

describe('resolveModeFlag', () => {
  it('resolves --managed', () => {
    expect(resolveModeFlag(true, false)).toBe('managed');
  });

  it('resolves --self-hosted', () => {
    expect(resolveModeFlag(false, true)).toBe('selfHosted');
  });

  it('returns undefined with neither flag', () => {
    expect(resolveModeFlag(false, false)).toBeUndefined();
  });

  it('throws when both flags are given', () => {
    expect(() => resolveModeFlag(true, true)).toThrow(
      '--managed and --self-hosted cannot both be given',
    );
  });
});

describe('inferMode', () => {
  it('is self-hosted on a fresh install (nothing wired)', () => {
    expect(inferMode(ctx())).toBe('selfHosted');
  });

  it('is managed when only the generic folder is wired', () => {
    expect(inferMode(ctx([folders.generic]))).toBe('managed');
  });

  it('is self-hosted when the self-hosted folder is wired', () => {
    expect(inferMode(ctx([folders.generic, folders.selfHosted]))).toBe(
      'selfHosted',
    );
  });

  it('is self-hosted when a stale self-hosted copy is wired', () => {
    expect(inferMode(ctx([staleSelfHosted]))).toBe('selfHosted');
  });

  it('never flips mode on an update (managed stays managed)', () => {
    expect(inferMode(ctx(['/other/entry', folders.generic]))).toBe('managed');
  });
});

describe('installChange', () => {
  it('fresh install, self-hosted: adds both folders', () => {
    const change = installChange(ctx(), 'selfHosted');
    expect(change).toEqual({
      sets: [
        {
          path: 'skills.load.extraDirs',
          value: [folders.generic, folders.selfHosted],
        },
      ],
      unsets: [],
    });
  });

  it('fresh install, --managed: adds the generic folder only', () => {
    const change = installChange(ctx(), 'managed');
    expect(change).toEqual({
      sets: [{ path: 'skills.load.extraDirs', value: [folders.generic] }],
      unsets: [],
    });
  });

  it('second install (already wired): nothing to change', () => {
    const change = installChange(
      ctx([folders.generic, folders.selfHosted]),
      'selfHosted',
    );
    expect(change).toEqual({ sets: [], unsets: [] });
  });

  it('managed, already wired: nothing to change', () => {
    const change = installChange(ctx([folders.generic]), 'managed');
    expect(change).toEqual({ sets: [], unsets: [] });
  });

  it('self-hosted -> --managed: removes the self-hosted entry', () => {
    const change = installChange(
      ctx([folders.generic, folders.selfHosted]),
      'managed',
    );
    expect(change).toEqual({
      sets: [{ path: 'skills.load.extraDirs', value: [folders.generic] }],
      unsets: [],
    });
  });

  it('managed -> --self-hosted: adds the self-hosted folder', () => {
    const change = installChange(ctx([folders.generic]), 'selfHosted');
    expect(change).toEqual({
      sets: [
        {
          path: 'skills.load.extraDirs',
          value: [folders.generic, folders.selfHosted],
        },
      ],
      unsets: [],
    });
  });

  it('replaces a stale entry (e.g. after an nvm/Node change)', () => {
    const change = installChange(ctx([staleGeneric]), 'managed');
    expect(change).toEqual({
      sets: [{ path: 'skills.load.extraDirs', value: [folders.generic] }],
      unsets: [],
    });
  });

  it('replaces a stale self-hosted entry in self-hosted mode', () => {
    const change = installChange(ctx([staleSelfHosted]), 'selfHosted');
    expect(change).toEqual({
      sets: [
        {
          path: 'skills.load.extraDirs',
          value: [folders.selfHosted, folders.generic],
        },
      ],
      unsets: [],
    });
  });

  it("preserves other users' entries and their order", () => {
    const change = installChange(
      ctx(['/alice/skills', staleGeneric, '/bob/skills']),
      'managed',
    );
    expect(change).toEqual({
      sets: [
        {
          path: 'skills.load.extraDirs',
          value: ['/alice/skills', folders.generic, '/bob/skills'],
        },
      ],
      unsets: [],
    });
  });
});

describe('uninstallChange', () => {
  it("removes only this package's entries and nothing else", () => {
    const change = uninstallChange(
      ctx(['/alice/skills', folders.generic, folders.selfHosted]),
    );
    expect(change).toEqual({
      sets: [{ path: 'skills.load.extraDirs', value: ['/alice/skills'] }],
      unsets: [],
    });
  });

  it('unsets extraDirs (not []) when it would empty the array', () => {
    const context: SkillsContext = {
      folders,
      config: {
        load: {
          extraDirs: [folders.generic, folders.selfHosted],
          otherKey: 'kept',
        },
      },
    };
    expect(uninstallChange(context)).toEqual({
      sets: [],
      unsets: ['skills.load.extraDirs'],
    });
  });

  it('unsets skills.load when extraDirs was all it held', () => {
    const context: SkillsContext = {
      folders,
      config: { load: { extraDirs: [folders.generic] } },
    };
    expect(uninstallChange(context)).toEqual({
      sets: [],
      unsets: ['skills.load'],
    });
  });

  it('is empty when nothing of this package is wired', () => {
    expect(uninstallChange(ctx(['/alice/skills']))).toEqual({
      sets: [],
      unsets: [],
    });
  });

  it('removes a stale entry too', () => {
    const context: SkillsContext = {
      folders,
      config: {
        load: { extraDirs: [staleGeneric, staleSelfHosted], otherKey: 'kept' },
      },
    };
    expect(uninstallChange(context)).toEqual({
      sets: [],
      unsets: ['skills.load.extraDirs'],
    });
  });
});

describe('statusLines', () => {
  it('reports mode, wiring, provided skills, stale and shadowing', () => {
    const context = ctx([staleGeneric, folders.selfHosted]);
    const lines = statusLines(context, {
      mode: 'selfHosted',
      providedSkills: {
        generic: ['jeeves-coding', 'jeeves-platform'],
        selfHosted: ['jeeves-onboarding'],
      },
      workspaceSkillNames: ['jeeves-onboarding'],
    });

    expect(lines[0]).toBe('mode: self-hosted');
    expect(lines).toContain(
      `skills/: ${folders.generic} — stale (wired as ${staleGeneric})`,
    );
    expect(lines).toContain('  jeeves-coding');
    expect(lines).toContain('  jeeves-platform');
    expect(lines).toContain(
      `skills-self-hosted/: ${folders.selfHosted} — wired`,
    );
    expect(lines).toContain(
      '  jeeves-onboarding (shadowed by a workspace skill)',
    );
  });

  it('reports missing when neither folder is wired', () => {
    const lines = statusLines(ctx(), {
      mode: 'selfHosted',
      providedSkills: { generic: [], selfHosted: [] },
      workspaceSkillNames: [],
    });
    expect(lines).toContain(`skills/: ${folders.generic} — missing`);
    expect(lines).toContain(
      `skills-self-hosted/: ${folders.selfHosted} — missing`,
    );
  });
});
