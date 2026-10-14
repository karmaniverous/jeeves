/**
 * Pure computation for `jeeves skills install | uninstall | status`
 * (Decision 71): mode inference, the `extraDirs` change each action makes,
 * and the status report. No I/O.
 *
 * @remarks
 * `--managed` wires only `skills/`; `--self-hosted` wires both folders.
 * With no flag, the mode is inferred from `skills.load.extraDirs`: the
 * self-hosted folder (current or stale) wired means self-hosted; only the
 * generic folder wired means managed; nothing wired (fresh install) means
 * self-hosted. `install` is idempotent, preserves every other entry and
 * its position, replaces a stale copy of either folder (a path ending in
 * `/node_modules/@karmaniverous/jeeves/skills[-self-hosted]` that no
 * longer matches the running package's own location, e.g. after an
 * nvm/Node change) with the current path, and drops the self-hosted
 * folder when the mode is managed. `uninstall` removes exactly this
 * package's entries (current and stale, both folders) and unsets
 * `skills.load.extraDirs` (and `skills.load` if that empties it) rather
 * than leaving `[]`.
 *
 * @module
 */

import { z } from 'zod';

import type { ConfigSetOperation } from '../plugins/openclawCommands.js';
import type { SkillsFolders } from './skillsFolders.js';

/** Which folder(s) `jeeves skills` wires. */
export type SkillsMode = 'managed' | 'selfHosted';

/** Config path of `skills.load.extraDirs`. */
export const EXTRA_DIRS_PATH = 'skills.load.extraDirs';

/** The slice of `openclaw.json` under `skills` this command reads. */
export const skillsConfigSchema = z.looseObject({
  load: z.looseObject({ extraDirs: z.array(z.string()).optional() }).optional(),
});

/** Parsed `skills` config slice (`{}` when unset). */
export type SkillsConfig = z.infer<typeof skillsConfigSchema>;

/** What a command works on. */
export interface SkillsContext {
  /** This package's two skill folders. */
  folders: SkillsFolders;
  /** OpenClaw's current `skills` config block. */
  config: SkillsConfig;
}

/** A change to OpenClaw's config: sets applied in one batch, then unsets. */
export interface SkillsChange {
  /** Paths to set (at most one: `skills.load.extraDirs`). */
  sets: ConfigSetOperation[];
  /** Paths to unset. */
  unsets: string[];
}

/** One of this package's two skill folders. */
type FolderKey = keyof SkillsFolders;

/**
 * Path suffix identifying each folder in any install location, so a
 * stale copy (e.g. after an nvm/Node change) is still recognised.
 */
const FOLDER_SUFFIX: Readonly<Record<FolderKey, string>> = {
  generic: '/node_modules/@karmaniverous/jeeves/skills',
  selfHosted: '/node_modules/@karmaniverous/jeeves/skills-self-hosted',
};

/** Normalize a path for comparison: forward slashes, no trailing slash. */
const normalize = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+$/, '');

/** Whether two paths are the same after {@link normalize}. */
const samePath = (a: string, b: string): boolean =>
  normalize(a) === normalize(b);

/** How an `extraDirs` entry relates to one of this package's folders. */
interface EntryKind {
  /** Which folder. */
  folder: FolderKey;
  /** `true` when it is an old install location, not the running package's. */
  stale: boolean;
}

/**
 * Classify an `extraDirs` entry as one of this package's folders (current
 * or stale), or `undefined` for anyone else's entry.
 */
function entryKind(
  entry: string,
  folders: SkillsFolders,
): EntryKind | undefined {
  for (const folder of ['generic', 'selfHosted'] as const) {
    if (samePath(entry, folders[folder])) return { folder, stale: false };
    if (normalize(entry).endsWith(FOLDER_SUFFIX[folder])) {
      return { folder, stale: true };
    }
  }
  return undefined;
}

/**
 * Whether an `extraDirs` entry is one of this package's folders (either
 * folder, current or stale).
 *
 * @param entry - An `extraDirs` entry.
 * @param folders - This package's folders.
 * @returns `true` for this package's entries.
 */
export const isOwnEntry = (entry: string, folders: SkillsFolders): boolean =>
  entryKind(entry, folders) !== undefined;

/** Whether an entry is this package's `folder` (current or stale). */
const isFolder = (
  entry: string,
  folders: SkillsFolders,
  folder: FolderKey,
): boolean => entryKind(entry, folders)?.folder === folder;

/**
 * Resolve `--managed`/`--self-hosted` into a mode, or `undefined` when
 * neither is given (infer from wiring).
 *
 * @param managed - `--managed` given.
 * @param selfHosted - `--self-hosted` given.
 * @returns The explicit mode, or `undefined`.
 * @throws Error when both flags are given.
 */
export function resolveModeFlag(
  managed: boolean,
  selfHosted: boolean,
): SkillsMode | undefined {
  if (managed && selfHosted) {
    throw new Error('--managed and --self-hosted cannot both be given');
  }
  if (managed) return 'managed';
  if (selfHosted) return 'selfHosted';
  return undefined;
}

/**
 * Infer the mode from the current wiring (spec section 5 scope C; Decision 71):
 * self-hosted folder wired (current or stale) wins; else only the generic
 * folder wired means managed; nothing wired (fresh install) means
 * self-hosted. Never flips a mode `install` already applied.
 *
 * @param context - Folders and current config.
 * @returns The inferred mode.
 */
export function inferMode(context: SkillsContext): SkillsMode {
  const extraDirs = context.config.load?.extraDirs ?? [];
  if (extraDirs.some((e) => isFolder(e, context.folders, 'selfHosted'))) {
    return 'selfHosted';
  }
  if (extraDirs.some((e) => isFolder(e, context.folders, 'generic'))) {
    return 'managed';
  }
  return 'selfHosted';
}

/**
 * The change `install` makes: idempotent, preserves every other entry and
 * its position, replaces a stale copy of either of this package's folders
 * with its current path, and drops the self-hosted folder when `mode` is
 * `managed`. Empty when `extraDirs` is already in the desired state.
 *
 * @param context - Folders and current config.
 * @param mode - The mode to wire (explicit flag, or {@link inferMode}).
 * @returns The change (`sets` empty when nothing needs to change).
 */
export function installChange(
  context: SkillsContext,
  mode: SkillsMode,
): SkillsChange {
  const { folders } = context;
  const extraDirs = context.config.load?.extraDirs ?? [];
  const next: string[] = [];
  for (const entry of extraDirs) {
    const kind = entryKind(entry, folders);
    if (!kind) next.push(entry);
    else if (kind.folder === 'generic' || mode === 'selfHosted') {
      next.push(folders[kind.folder]);
    }
  }
  if (!next.some((entry) => samePath(entry, folders.generic))) {
    next.push(folders.generic);
  }
  if (
    mode === 'selfHosted' &&
    !next.some((entry) => samePath(entry, folders.selfHosted))
  ) {
    next.push(folders.selfHosted);
  }

  const changed =
    next.length !== extraDirs.length ||
    next.some((entry, i) => entry !== extraDirs[i]);
  return changed
    ? { sets: [{ path: EXTRA_DIRS_PATH, value: next }], unsets: [] }
    : { sets: [], unsets: [] };
}

/** Whether `object` holds nothing but `key`. */
const onlyKey = (
  object: Record<string, unknown> | undefined,
  key: string,
): boolean =>
  object !== undefined && Object.keys(object).length === 1 && key in object;

/**
 * The change `uninstall` makes: removes exactly this package's entries
 * (current and stale, both folders) and nothing else; unsets
 * `skills.load.extraDirs` (and `skills.load` if that empties it) rather
 * than leaving `[]`. Empty when nothing of this package's is wired.
 *
 * @param context - Folders and current config.
 * @returns The change.
 */
export function uninstallChange(context: SkillsContext): SkillsChange {
  const { folders } = context;
  const extraDirs = context.config.load?.extraDirs ?? [];
  const next = extraDirs.filter((entry) => !isOwnEntry(entry, folders));
  if (next.length === extraDirs.length) return { sets: [], unsets: [] };
  if (next.length > 0) {
    return { sets: [{ path: EXTRA_DIRS_PATH, value: next }], unsets: [] };
  }
  return {
    sets: [],
    unsets: [
      onlyKey(context.config.load, 'extraDirs')
        ? 'skills.load'
        : EXTRA_DIRS_PATH,
    ],
  };
}

/** Folder wiring states for {@link statusLines}. */
type FolderState = 'wired' | 'missing' | `stale (wired as ${string})`;

/** The wiring state of one of this package's folders. */
function folderState(
  extraDirs: readonly string[],
  folders: SkillsFolders,
  which: FolderKey,
): FolderState {
  if (extraDirs.some((entry) => samePath(entry, folders[which]))) {
    return 'wired';
  }
  const stale = extraDirs.find((entry) => {
    const kind = entryKind(entry, folders);
    return kind?.folder === which && kind.stale;
  });
  return stale ? `stale (wired as ${stale})` : 'missing';
}

/** Skill names each folder provides, for {@link statusLines}. */
export interface SkillsProvided {
  /** Skills under `skills/`. */
  generic: readonly string[];
  /** Skills under `skills-self-hosted/`. */
  selfHosted: readonly string[];
}

/** Input to {@link statusLines} beyond the context. */
export interface SkillsStatusInput {
  /** The inferred mode. */
  mode: SkillsMode;
  /** Skill names each folder provides. */
  providedSkills: SkillsProvided;
  /**
   * Shipped skill name to the other sources that provide a skill of the
   * same name (see `skillsShadow.ts`). Skills found nowhere else are absent.
   */
  shadows: Readonly<Record<string, readonly string[]>>;
}

/** One folder's status lines: the folder line, then one per skill. */
function folderLines(
  label: string,
  path: string,
  state: FolderState,
  skills: readonly string[],
  shadows: Readonly<Record<string, readonly string[]>>,
): string[] {
  const lines = [`${label}: ${path} — ${state}`];
  for (const skill of skills) {
    const others = shadows[skill] ?? [];
    const shadow = others.length > 0 ? ` (also in: ${others.join('; ')})` : '';
    lines.push(`  ${skill}${shadow}`);
  }
  return lines;
}

/**
 * The `status` report: inferred mode, each folder's wiring state and the
 * skills it provides, and every other source holding a same-named skill
 * (a higher-precedence source shadows the shipped copy; another
 * `extraDirs` entry collides with it). Never fails on shadowing: it only
 * reports.
 *
 * @param context - Folders and current config.
 * @param input - Inferred mode, provided skills, and workspace skill names.
 * @returns Lines to print.
 */
export function statusLines(
  context: SkillsContext,
  input: SkillsStatusInput,
): string[] {
  const extraDirs = context.config.load?.extraDirs ?? [];
  return [
    `mode: ${input.mode === 'managed' ? 'managed' : 'self-hosted'}`,
    ...folderLines(
      'skills/',
      context.folders.generic,
      folderState(extraDirs, context.folders, 'generic'),
      input.providedSkills.generic,
      input.shadows,
    ),
    ...folderLines(
      'skills-self-hosted/',
      context.folders.selfHosted,
      folderState(extraDirs, context.folders, 'selfHosted'),
      input.providedSkills.selfHosted,
      input.shadows,
    ),
  ];
}
