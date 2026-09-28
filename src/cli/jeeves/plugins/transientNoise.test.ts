import { describe, expect, it } from 'vitest';

import {
  createTransientNoise,
  filterTransientNoise,
  stripAnsi,
  TRANSIENT_NOISE_NOTE,
} from './transientNoise.js';

// Samples from a real `jeeves install` (OpenClaw 2026.9.6, core 0.6.0-9, #117).
const R = 'jeeves-runner-openclaw';
const W = 'jeeves-watcher-openclaw';
const M = 'jeeves-meta-openclaw';

const ESC = '\u001b';
const color = (code: number, s: string): string =>
  `${ESC}[${String(code)}m${s}${ESC}[39m`;

const stale = (id: string): string =>
  `plugins.entries.${id}: plugin not found: ${id} (stale config entry ignored; remove it from plugins config)`;
const unchecked = (id: string): string =>
  `plugins.entries.${id}: Plugin "${id}" settings cannot be checked until its data/settings upgrade finishes. Your existing settings have been kept. Run "openclaw update status" for repair details.`;
const migration = (
  id: string,
  reason = 'The configured plugin package is missing or has not converged.',
): string =>
  `${color(32, '[state-migrations]')} ${color(33, `Plugin "${id}" data/settings upgrade is unfinished: ${reason} Your existing data and settings have been kept. Run "openclaw update repair", then "openclaw doctor --fix" to retry the upgrade. pluginId=${id} status=pending`)}`;

const box = (bodyLines: string[]): string[] => [
  '│',
  '◇  Doctor warnings ───────────────────────────────────────────────────────╮',
  '│                                                                         │',
  ...bodyLines.map((l) => `│  ${l.padEnd(71)}│`),
  '│                                                                         │',
  '├─────────────────────────────────────────────────────────────────────────╯',
];
const unfinishedBox = (id: string): string[] =>
  box([
    `- Plugin "${id}" data/settings upgrade is`,
    '  unfinished: The configured plugin package is missing or has not',
    '  converged. Your existing data and settings have been kept. Run',
    '  "openclaw update repair", then "openclaw doctor --fix" to retry the',
    '  upgrade.',
  ]);

const INSTALLED = [
  'WARNING - Installing plugin from npm registry: npm:@karmaniverous/jeeves-runner-openclaw@0.9.0-3',
  `Installed plugin: ${R}`,
  'Applied in Gateway generation 4.',
  '',
];

describe('filterTransientNoise', () => {
  it('drops Doctor warnings boxes about pending plugins, keeping the real output', () => {
    const text = [...unfinishedBox(M), ...unfinishedBox(R), ...INSTALLED].join(
      '\n',
    );
    const result = filterTransientNoise(text, new Set([R, M]));
    expect(result.text).toBe(INSTALLED.join('\n'));
    expect(result.suppressed.sort()).toEqual([M, R]);
  });

  it('keeps a box about a plugin that is not pending', () => {
    const text = unfinishedBox(W).join('\n');
    expect(filterTransientNoise(text, new Set([R])).text).toBe(text);
  });

  it('keeps a box with any other bullet in it', () => {
    const text = box([
      `- Plugin "${R}" data/settings upgrade is unfinished: missing or has`,
      '  not converged.',
      '- Gateway auth token is weak.',
    ]).join('\n');
    expect(filterTransientNoise(text, new Set([R])).text).toBe(text);
  });

  it('keeps an unfinished upgrade with a different reason', () => {
    const text = box([
      `- Plugin "${R}" data/settings upgrade is unfinished: migration step`,
      '  3 threw an error.',
    ]).join('\n');
    expect(filterTransientNoise(text, new Set([R])).text).toBe(text);
    const line = migration(R, 'Migration step 3 threw an error.');
    expect(filterTransientNoise(line, new Set([R])).text).toBe(line);
  });

  it('keeps an unterminated box', () => {
    const text = unfinishedBox(R).slice(0, -1).join('\n');
    expect(filterTransientNoise(text, new Set([R])).text).toBe(text);
  });

  it('drops the stale-entry and settings warning lines for pending plugins only', () => {
    const text = [
      `Config warnings: ${[stale(R), stale(W), stale(M)].join('; ')}`,
      `${color(35, '[config]')} ${color(33, `warnings: ${[unchecked(R), unchecked(M)].join('; ')}`)}`,
      migration(M),
      migration(R),
      'Error: something real',
    ].join('\n');
    const result = filterTransientNoise(text, new Set([R, M]));
    expect(result.text).toBe(
      [`Config warnings: ${stale(W)}`, 'Error: something real'].join('\n'),
    );
    expect(result.suppressed.sort()).toEqual([M, R]);
  });

  it('keeps other items of a warning line', () => {
    const other = 'plugins.entries.x: unknown key "foo"';
    const text = `Config warnings: ${stale(R)}; ${other}`;
    expect(filterTransientNoise(text, new Set([R])).text).toBe(
      `Config warnings: ${other}`,
    );
  });

  it('changes nothing without pending plugins or matches', () => {
    const text = [...unfinishedBox(R), migration(R)].join('\n');
    expect(filterTransientNoise(text, new Set())).toEqual({
      text,
      suppressed: [],
    });
    expect(filterTransientNoise('plain\r\nlines\n', new Set([R])).text).toBe(
      'plain\nlines\n',
    );
  });

  it('strips ANSI colour codes', () => {
    expect(stripAnsi(color(35, '[config]'))).toBe('[config]');
  });
});

describe('createTransientNoise', () => {
  it('filters until a plugin is installed, and notes the suppression once', () => {
    const noise = createTransientNoise([R, W]);
    const log: string[] = [];
    noise.flushNote((l) => log.push(l));
    expect(log).toEqual([]);
    expect(noise.filter(migration(R))).toBe('');
    noise.flushNote((l) => log.push(l));
    noise.installed(R);
    // Still reported after its install: shown again.
    expect(noise.filter(migration(R))).toBe(migration(R));
    expect(noise.filter(migration(W))).toBe('');
    noise.flushNote((l) => log.push(l));
    expect(log).toEqual([TRANSIENT_NOISE_NOTE]);
  });
});
