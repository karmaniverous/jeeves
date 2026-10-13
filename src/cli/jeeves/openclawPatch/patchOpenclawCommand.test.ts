import type ChildProcess from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async () => {
  const actual =
    await vi.importActual<typeof ChildProcess>('node:child_process');
  return { ...actual, execSync: vi.fn() };
});

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Command } from '@commander-js/extra-typings';

import { RESTART_NOTICE } from '../cliOutput.js';
import {
  registerPatchOpenClawCommand,
  runOpenClawPatches,
} from './patchOpenclawCommand.js';

const mockedExecSync = vi.mocked(execSync);

const arrayOf = (tokens: readonly string[]): string =>
  `const toolOrder = [\n${tokens.map((t) => `\t\t${t}`).join(',\n')}\n\t]`;

const PRISTINE = `${arrayOf(['"read"', '"grep"', '"glob"'])};\n`;

let distDir: string;

beforeEach(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-openclaw-cli-'));
  fs.writeFileSync(path.join(distDir, 'system-prompt-DEAD.mjs'), PRISTINE);
  mockedExecSync.mockReturnValue(`${path.dirname(distDir)}\n`);
  // Point `npm root -g` resolution at our temp dist's parent so
  // `resolveOpenClawDist` finds the fixture directory.
  fs.mkdirSync(path.join(path.dirname(distDir), 'openclaw'), {
    recursive: true,
  });
  mockedExecSync.mockImplementation(() => {
    throw new Error('npm not mocked for this fixture');
  });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.NVM_DIR = path.dirname(distDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NVM_DIR;
  fs.rmSync(distDir, { recursive: true, force: true });
});

describe('runOpenClawPatches', () => {
  it('never invokes a gateway restart command', () => {
    // Force resolveOpenClawDist to the fixture via the nvm `current` symlink
    // shape it scans: NVM_DIR/current/lib/node_modules/openclaw/dist.
    const nvmDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvm-'));
    const currentDist = path.join(
      nvmDir,
      'current',
      'lib',
      'node_modules',
      'openclaw',
      'dist',
    );
    fs.mkdirSync(currentDist, { recursive: true });
    fs.writeFileSync(
      path.join(currentDist, 'system-prompt-DEAD.mjs'),
      PRISTINE,
    );
    fs.mkdirSync(path.join(nvmDir, 'versions', 'node'), { recursive: true });
    process.env.NVM_DIR = nvmDir;

    try {
      runOpenClawPatches({ dryRun: false });
    } finally {
      fs.rmSync(nvmDir, { recursive: true, force: true });
    }

    for (const call of mockedExecSync.mock.calls) {
      const command = call[0];
      expect(command).not.toMatch(/gateway/i);
      expect(command).not.toMatch(/restart/i);
    }
  });
});

describe('registerPatchOpenClawCommand', () => {
  it('registers a patch-openclaw subcommand with a --dry-run option', () => {
    const program = new Command();
    registerPatchOpenClawCommand(program);
    const sub = program.commands.find((c) => c.name() === 'patch-openclaw');
    expect(sub).toBeDefined();
    expect(sub?.options.some((o) => o.long === '--dry-run')).toBe(true);
  });
});

describe('RESTART_NOTICE reuse', () => {
  it('exports the shared gateway restart notice text', () => {
    expect(RESTART_NOTICE).toMatch(/restart/i);
  });
});
