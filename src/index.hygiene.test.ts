/**
 * Lifecycle hygiene: importing the library must not install process-level
 * signal/exit handlers (runbook D2/S1; v0.x leaked them via signal-exit).
 */

import { describe, expect, it } from 'vitest';

const EVENTS = [
  'SIGINT',
  'SIGTERM',
  'SIGHUP',
  'SIGBREAK',
  'exit',
  'beforeExit',
] as const;

function listenerCounts(): Record<string, number> {
  return Object.fromEntries(EVENTS.map((e) => [e, process.listenerCount(e)]));
}

describe('library import hygiene', () => {
  it('registers no process signal or exit handlers', async () => {
    const before = listenerCounts();
    const lib = await import('./index.js');
    expect(Object.keys(lib).length).toBeGreaterThan(0);
    expect(listenerCounts()).toEqual(before);
  });
});
