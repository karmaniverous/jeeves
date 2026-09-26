/**
 * Decide the jeeves-server plugin key for both ends: the plugin entry
 * (`plugins.entries.jeeves-server-openclaw.config.pluginKey`) and the
 * server's `keys._plugin`. Pure; used by `jeeves install` and `jeeves update`.
 *
 * @remarks
 * Owner decision (2026-09-25 10:35):
 * - server has a literal key -\> the plugin gets it;
 * - server has none, plugin has one -\> the plugin's key is copied into
 *   `keys._plugin`;
 * - neither has one -\> generate one and write both ends;
 * - both have keys and they differ -\> fail before any change, unless a key
 *   is passed explicitly (`--server-plugin-key`, or `server.pluginKey` in
 *   `--plugin-config`), which is then written to both ends;
 * - server config missing, or `keys._plugin` not a literal (e.g. a `${VAR}`
 *   reference) -\> the server end is never written; the plugin end is written
 *   (or kept) with a warning, and it fails when a key would have to be
 *   generated (it could not be synced).
 * - server config not a JSON object -\> fail, unless the plugin already has
 *   a key and nothing is passed (then nothing changes, with a warning).
 *
 * Messages never contain a key.
 *
 * @module
 */

import type { ServerKeyState } from './serverPluginKey.js';

/** Where the decided key came from. */
export type ServerKeySource =
  'option' | 'file' | 'existing' | 'server config' | 'generated';

/** What the server's `keys._plugin` must look like right before writing. */
export type ServerKeyExpectation =
  { kind: 'absent' } | { kind: 'literal'; value: string };

/** A planned `keys._plugin` write. */
export interface ServerKeyWrite {
  /** Server config file. */
  path: string;
  /** Seed to set (secret). */
  value: string;
  /** Required current state (re-checked under the file lock). */
  expect: ServerKeyExpectation;
}

/** The decision. */
export interface ServerKeyDecision {
  /** Seed for the plugin entry. */
  value: string;
  /** Provenance. */
  source: ServerKeySource;
  /** Write the plugin entry. */
  writePlugin: boolean;
  /** Write the server config. */
  serverWrite?: ServerKeyWrite;
  /** Warning to print (no secret). */
  warning?: string;
}

/** Inputs of {@link decideServerPluginKey}. */
export interface ServerKeyInput {
  /** Explicit key (CLI option or `--plugin-config`). */
  explicit?: { value: string; source: 'option' | 'file' };
  /** The plugin entry's current key. */
  plugin?: string;
  /** The server's `keys._plugin` state. */
  server: ServerKeyState;
  /** Server config path (undefined when configRoot is unknown). */
  serverPath?: string;
  /** Generate a new seed. */
  generate: () => string;
}

/** Thrown when the two ends disagree or can't be reconciled safely. */
export class ServerPluginKeyError extends Error {
  /** @param message - Message (never contains a key). */
  constructor(message: string) {
    super(message);
    this.name = 'ServerPluginKeyError';
  }
}

const HINT =
  'Pass --server-plugin-key <seed> (or server.pluginKey in --plugin-config) to write one seed to both ends.';

const where = (input: ServerKeyInput): string =>
  input.serverPath ?? 'the jeeves-server config (configRoot unknown)';

/** Server write when the server end is writable and differs. */
function serverWriteFor(
  input: ServerKeyInput,
  value: string,
): ServerKeyWrite | undefined {
  const { server, serverPath } = input;
  if (serverPath === undefined) return undefined;
  if (server.kind === 'absent') {
    return { path: serverPath, value, expect: { kind: 'absent' } };
  }
  if (server.kind === 'literal' && server.value !== value) {
    return {
      path: serverPath,
      value,
      expect: { kind: 'literal', value: server.value },
    };
  }
  return undefined;
}

/** Warning for a server end that can't be written. */
function unwritableWarning(input: ServerKeyInput): string | undefined {
  switch (input.server.kind) {
    case 'noFile':
      return `${where(input)} not found; only the plugin side was set. Set keys._plugin there to the same seed, then restart jeeves-server.`;
    case 'opaque':
      return `keys._plugin in ${where(input)} is not a literal seed (e.g. an env reference) and was left unchanged; make sure it resolves to the plugin's seed.`;
    case 'unreadable':
      return `${where(input)} is not a valid JSON object; keys._plugin was not checked.`;
    default:
      return undefined;
  }
}

/**
 * Decide the key for both ends.
 *
 * @param input - Current state and explicit value.
 * @returns The decision.
 * @throws ServerPluginKeyError on a conflict or an unsafe state.
 */
export function decideServerPluginKey(
  input: ServerKeyInput,
): ServerKeyDecision {
  const { explicit, plugin, server } = input;
  const decide = (
    value: string,
    source: ServerKeySource,
  ): ServerKeyDecision => {
    const serverWrite = serverWriteFor(input, value);
    const warning = unwritableWarning(input);
    return {
      value,
      source,
      writePlugin: value !== plugin,
      ...(serverWrite ? { serverWrite } : {}),
      ...(warning ? { warning } : {}),
    };
  };
  if (server.kind === 'unreadable' && (explicit || plugin === undefined)) {
    throw new ServerPluginKeyError(
      `${where(input)} is not a valid JSON object, so keys._plugin can't be read or set. Fix the file and re-run.`,
    );
  }
  if (explicit) return decide(explicit.value, explicit.source);
  if (server.kind === 'literal') {
    if (plugin !== undefined && plugin !== server.value) {
      throw new ServerPluginKeyError(
        `The jeeves-server plugin key in openclaw.json differs from keys._plugin in ${where(input)}; jeeves-server would reject the plugin. Nothing was changed. ${HINT}`,
      );
    }
    return decide(
      server.value,
      plugin === undefined ? 'server config' : 'existing',
    );
  }
  if (plugin !== undefined) return decide(plugin, 'existing');
  if (server.kind === 'absent') return decide(input.generate(), 'generated');
  throw new ServerPluginKeyError(
    server.kind === 'noFile'
      ? `${where(input)} not found, so a generated plugin key could not be given to jeeves-server. Nothing was changed. Create the server config first, or pass --server-plugin-key <seed> and set keys._plugin to the same seed in the server config yourself.`
      : `keys._plugin in ${where(input)} is not a literal seed (e.g. an env reference), so the plugin key can't be derived from it. Nothing was changed. ${HINT}`,
  );
}
