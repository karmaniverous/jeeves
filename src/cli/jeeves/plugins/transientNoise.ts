/**
 * Hide OpenClaw's expected, transient warnings about plugins that a plan run
 * is about to install.
 *
 * @remarks
 * `jeeves install` writes every plugin's `plugins.entries.<id>` config in one
 * batch before installing the plugins, so the gateway reloads once (#112).
 * Until each plugin is installed, OpenClaw warns about it in every command
 * that follows (#117):
 *
 * - stderr `Config warnings:` items
 *   `plugins.entries.<id>: plugin not found: <id> (stale config entry ignored; ...)`;
 * - stderr `[config] warnings:` items `plugins.entries.<id>: Plugin "<id>"`
 *   "settings cannot be checked until its data/settings upgrade finishes";
 * - stderr `[state-migrations] Plugin "<id>" data/settings upgrade is unfinished:`
 *   lines whose reason is "missing or has not converged";
 * - stdout "Doctor warnings" boxes whose bullets are all that same
 *   `upgrade is unfinished` message.
 *
 * {@link filterTransientNoise} drops exactly those items, and only for plugin
 * ids that are still pending in this run. Anything else (other plugins,
 * other reasons, other warnings in the same line or box) is kept, so real
 * problems stay visible. Only echoed output is filtered: captured output and
 * `CommandFailedError` messages are untouched.
 *
 * @module
 */

/** Result of filtering one output text. */
export interface FilteredOutput {
  /** The text without the transient items. */
  text: string;
  /** Plugin ids whose transient warnings were removed. */
  suppressed: string[];
}

// ANSI SGR matcher, built from a string so no control character appears in
// a regex literal.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Remove ANSI colour codes.
 *
 * @param text - Text.
 * @returns Text without SGR sequences.
 */
export const stripAnsi = (text: string): string => text.replace(ANSI, '');

/** The benign reason OpenClaw gives while a configured plugin is missing. */
const NOT_CONVERGED = /missing or has not converged/;

/** An item-list warning line: prefix, then `; `-separated entry items. */
interface ItemLine {
  prefix: RegExp;
  benign: (item: string, id: string) => boolean;
}

const ITEM_LINES: readonly ItemLine[] = [
  {
    prefix: /^Config warnings: /,
    benign: (item, id) =>
      item.startsWith(`plugin not found: ${id} (stale config entry ignored`),
  },
  {
    prefix: /^\[config\] warnings: /,
    benign: (item, id) =>
      item.startsWith(
        `Plugin "${id}" settings cannot be checked until its data/settings upgrade finishes`,
      ),
  },
];

const ENTRY_ITEM = /^plugins\.entries\.([^:\s]+): ([\s\S]*)$/;

/**
 * Filter an item-list warning line.
 *
 * @param plain - The line without ANSI codes.
 * @param pending - Pending plugin ids.
 * @param suppressed - Collects the ids whose items were removed.
 * @returns The kept line (`undefined` to drop it), or `null` when the line
 *   is not an item-list warning.
 */
function filterItemLine(
  plain: string,
  pending: ReadonlySet<string>,
  suppressed: Set<string>,
): string | undefined | null {
  for (const { prefix, benign } of ITEM_LINES) {
    const head = prefix.exec(plain)?.[0];
    if (head === undefined) continue;
    const items = plain.slice(head.length).split(/; (?=plugins\.entries\.)/);
    const kept = items.filter((item) => {
      const m = ENTRY_ITEM.exec(item);
      if (!m || !pending.has(m[1]) || !benign(m[2], m[1])) return true;
      suppressed.add(m[1]);
      return false;
    });
    if (kept.length === items.length) return plain;
    return kept.length === 0 ? undefined : `${head}${kept.join('; ')}`;
  }
  return null;
}

const UNFINISHED = /Plugin "([^"]+)" data\/settings upgrade is unfinished:/;

/**
 * The plugin id when a single warning (log line or box bullet) is the benign
 * `upgrade is unfinished` message for a pending plugin.
 *
 * @param text - The warning.
 * @param pending - Pending plugin ids.
 * @returns The plugin id, or `undefined`.
 */
function benignUnfinished(
  text: string,
  pending: ReadonlySet<string>,
): string | undefined {
  const id = UNFINISHED.exec(text)?.[1];
  return id !== undefined && pending.has(id) && NOT_CONVERGED.test(text)
    ? id
    : undefined;
}

const STATE_MIGRATION = /^\[state-migrations\] /;
const BOX_START = /^◇\s+Doctor warnings\b/;
const BOX_END = /^├─+╯\s*$/;
const BOX_RAIL = /^│\s*$/;

/**
 * The plugin ids of a Doctor warnings box when every bullet in it is benign.
 *
 * @param body - Box body lines (without the title and bottom border).
 * @param pending - Pending plugin ids.
 * @returns Ids, or `undefined` when anything else is in the box.
 */
function benignBox(
  body: readonly string[],
  pending: ReadonlySet<string>,
): string[] | undefined {
  const bullets: string[] = [];
  for (const raw of body) {
    const line = stripAnsi(raw).replace(/^│/, '').replace(/│\s*$/, '').trim();
    if (line === '') continue;
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else if (bullets.length === 0) return undefined;
    else bullets[bullets.length - 1] += ` ${line}`;
  }
  const ids: string[] = [];
  for (const bullet of bullets) {
    const id = bullet.startsWith('Plugin "')
      ? benignUnfinished(bullet, pending)
      : undefined;
    if (id === undefined) return undefined;
    ids.push(id);
  }
  return ids.length > 0 ? ids : undefined;
}

/**
 * Remove OpenClaw's transient warnings about plugins that are still pending
 * installation in this run.
 *
 * @param text - Echoed stdout or stderr of one command.
 * @param pending - Plugin ids this run configured but has not installed yet.
 * @returns The filtered text and the ids whose warnings were removed.
 */
export function filterTransientNoise(
  text: string,
  pending: ReadonlySet<string>,
): FilteredOutput {
  if (pending.size === 0 || text === '') return { text, suppressed: [] };
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const suppressed = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const plain = stripAnsi(line);
    if (BOX_START.test(plain)) {
      const end = lines.findIndex(
        (l, j) => j > i && BOX_END.test(stripAnsi(l)),
      );
      const ids =
        end > i ? benignBox(lines.slice(i + 1, end), pending) : undefined;
      if (ids) {
        for (const id of ids) suppressed.add(id);
        if (out.length > 0 && BOX_RAIL.test(stripAnsi(out[out.length - 1]))) {
          out.pop();
        }
        i = end;
        continue;
      }
    }
    if (STATE_MIGRATION.test(plain)) {
      const id = benignUnfinished(plain, pending);
      if (id !== undefined) {
        suppressed.add(id);
        continue;
      }
    }
    const item = filterItemLine(plain, pending, suppressed);
    if (item === undefined) continue;
    out.push(item === null || item === plain ? line : item);
  }
  return { text: out.join('\n'), suppressed: [...suppressed] };
}

/** Note printed once, the first time transient warnings are hidden. */
export const TRANSIENT_NOISE_NOTE =
  'note: hid OpenClaw\'s transient "stale config entry" / "data/settings upgrade is unfinished" warnings for plugins this run had configured but not yet installed (expected until each install completes; other warnings are shown)';

/** Per-run state of the transient warning filter. */
export interface TransientNoise {
  /** Filter one echoed output text. */
  filter: (text: string) => string;
  /** Mark a plugin installed: its warnings are shown again from now on. */
  installed: (pluginId: string) => void;
  /** Log {@link TRANSIENT_NOISE_NOTE} once, after the first suppression. */
  flushNote: (log: (line: string) => void) => void;
}

/**
 * Create the filter for one plan run.
 *
 * @param pluginIds - Plugins the run installs.
 * @returns Filter state.
 */
export function createTransientNoise(
  pluginIds: readonly string[],
): TransientNoise {
  const pending = new Set(pluginIds);
  let hidden = false;
  let noted = false;
  return {
    filter: (text) => {
      const result = filterTransientNoise(text, pending);
      if (result.suppressed.length > 0) hidden = true;
      return result.text;
    },
    installed: (pluginId) => {
      pending.delete(pluginId);
    },
    flushNote: (log) => {
      if (hidden && !noted) {
        noted = true;
        log(TRANSIENT_NOISE_NOTE);
      }
    },
  };
}
