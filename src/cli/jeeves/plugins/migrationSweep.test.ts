import { describe, expect, it } from 'vitest';

import { failed, fakeRunner } from './fakePorts.js';
import { MIGRATION_SWEEP_LINE, runMigrationSweep } from './migrationSweep.js';

describe('runMigrationSweep', () => {
  it('runs plugins inspect --all --json and logs the command', async () => {
    const fake = fakeRunner();
    const log: string[] = [];
    await runMigrationSweep(fake.runner, (l) => log.push(l));
    expect(fake.lines()).toEqual(['openclaw plugins inspect --all --json']);
    expect(log).toEqual([`$ ${MIGRATION_SWEEP_LINE}`]);
  });

  it('logs a non-zero exit without failing', async () => {
    const fake = fakeRunner({ 'openclaw plugins inspect': failed('x', 2) });
    const log: string[] = [];
    await runMigrationSweep(fake.runner, (l) => log.push(l));
    expect(log.at(-1)).toBe(
      'plugin migration sweep failed (continuing): openclaw plugins inspect --all --json exited 2',
    );
  });

  it('logs a spawn failure without failing', async () => {
    const log: string[] = [];
    await runMigrationSweep(
      () => Promise.reject(new Error('spawn ENOENT')),
      (l) => log.push(l),
    );
    expect(log.at(-1)).toBe(
      'plugin migration sweep failed (continuing): Error: spawn ENOENT',
    );
  });
});
