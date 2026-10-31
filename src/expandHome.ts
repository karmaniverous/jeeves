/**
 * Leading-`~` expansion shared by workspace and bootstrap path handling.
 *
 * @module
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Expand a leading `~` (alone, or followed by `/` or `\\`) to a home
 * directory. Other paths are returned unchanged.
 *
 * @param path - Path.
 * @param home - Home directory (default: the current user's).
 * @returns The expanded path.
 */
export function expandHome(path: string, home: string = homedir()): string {
  return path === '~' || /^~[/\\]/.test(path)
    ? join(home, path.slice(1))
    : path;
}
