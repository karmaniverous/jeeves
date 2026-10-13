import type ChildProcess from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every way to start a process is a spy, so a live run can prove it never
// shells out (in particular, never runs `openclaw gateway restart`).
vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof ChildProcess>('node:child_process');
  return {
    ...actual,
    exec: vi.fn(),
    execFile: vi.fn(),
    execFileSync: vi.fn(),
    execSync: vi.fn(),
    fork: vi.fn(),
    spawn: vi.fn(),
    spawnSync: vi.fn(),
  };
});

import * as childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Command } from '@commander-js/extra-typings';

import { RESTART_NOTICE } from '../cliOutput.js';
import type { PatchLogger } from './distPatchIo.js';
import { registerPatchOpenClawCommand } from './patchOpenclawCommand.js';
import type { DistPatch } from './patchRunner.js';

const PRISTINE = 'const toolOrder = [\n\t\t"read",\n\t\t"grep"\n\t];\n';

let distDir: string;
let logs: string[];
let errors: string[];
let logger: PatchLogger;

beforeEach(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-openclaw-cli-'));
  fs.writeFileSync(path.join(distDir, 'system-prompt-DEAD.mjs'), PRISTINE);
  logs = [];
  errors = [];
  logger = {
    log: (l) => logs.push(l),
    error: (l) => errors.push(l),
  };
});

afterEach(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
  process.exitCode = undefined;
  vi.clearAllMocks();
});

/** Run `jeeves patch-openclaw` with injected ports. */
async function runCli(
  args: string[],
  ports: { patches?: readonly DistPatch[]; resolveDist?: () => string } = {},
): Promise<void> {
  const program = new Command();
  registerPatchOpenClawCommand(program, {
    logger,
    resolveDist: () => distDir,
    ...ports,
  });
  await program.parseAsync(['node', 'jeeves', 'patch-openclaw', ...args]);
}

const readDist = (): string =>
  fs.readFileSync(path.join(distDir, 'system-prompt-DEAD.mjs'), 'utf8');

const restartNotices = (): number =>
  logs.filter((l) => l === RESTART_NOTICE).length;

describe('jeeves patch-openclaw', () => {
  it('patches the dist and prints the restart notice once, without starting any process', async () => {
    await runCli([]);

    expect(readDist()).toContain('"watcher_search"');
    expect(restartNotices()).toBe(1);
    expect(process.exitCode).toBeUndefined();
    for (const fn of [
      childProcess.exec,
      childProcess.execFile,
      childProcess.execFileSync,
      childProcess.execSync,
      childProcess.fork,
      childProcess.spawn,
      childProcess.spawnSync,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('a second run changes nothing and prints no restart notice', async () => {
    await runCli([]);
    const patched = readDist();
    logs = [];

    await runCli([]);

    expect(readDist()).toBe(patched);
    expect(restartNotices()).toBe(0);
    expect(logs.some((l) => l.includes('already patched'))).toBe(true);
  });

  it('--dry-run writes nothing and prints no restart notice', async () => {
    await runCli(['--dry-run']);

    expect(readDist()).toBe(PRISTINE);
    expect(restartNotices()).toBe(0);
    expect(logs.some((l) => l.includes('WOULD PATCH'))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('runs every patch when one fails, and exits non-zero', async () => {
    const ran: string[] = [];
    const patches: DistPatch[] = [
      {
        name: 'broken',
        run: () => {
          ran.push('broken');
          throw new Error('boom');
        },
      },
      {
        name: 'fine',
        run: () => {
          ran.push('fine');
          return { name: 'fine', status: 'already-patched', message: 'ok' };
        },
      },
    ];

    await runCli([], { patches });

    expect(ran).toEqual(['broken', 'fine']);
    expect(logs).toContain('  FAILED  broken — boom');
    expect(process.exitCode).toBe(1);
  });

  it('reports a missing OpenClaw install as a failure instead of throwing', async () => {
    await runCli([], {
      resolveDist: () => {
        throw new Error('OpenClaw dist directory not found.');
      },
    });

    expect(errors).toEqual([
      '[patch-openclaw] FAILED: OpenClaw dist directory not found.',
    ]);
    expect(restartNotices()).toBe(0);
    expect(process.exitCode).toBe(1);
  });
});
