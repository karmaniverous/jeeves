/**
 * The `jeeves skills` CLI layer: flag parsing, the dry-run footer and the
 * exit code. `runSkillsCommand` itself is covered in `skillsCommand.test.ts`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from '@commander-js/extra-typings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DRY_RUN_COMPLETE } from '../cliOutput.js';
import { failed, fakeRunner, fakeTempFiles, ok } from '../plugins/fakePorts.js';
import { registerSkillsCommand, skillsModeFromCli } from './skillsCommand.js';

const GET = 'openclaw config get skills --json';

let pkgRoot: string;
let workspace: string;
let logs: string[];
let errors: string[];

beforeEach(() => {
  pkgRoot = mkdtempSync(path.join(tmpdir(), 'jeeves-skills-cli-'));
  for (const folder of ['skills', 'skills-self-hosted']) {
    mkdirSync(path.join(pkgRoot, folder, 'x'), { recursive: true });
    writeFileSync(path.join(pkgRoot, folder, 'x', 'SKILL.md'), '# x');
  }
  workspace = mkdtempSync(path.join(tmpdir(), 'jeeves-skills-ws-'));
  logs = [];
  errors = [];
});

afterEach(() => {
  rmSync(pkgRoot, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
  process.exitCode = undefined;
});

/** Run `jeeves skills <args>` against a fake OpenClaw. */
async function runCli(
  args: string[],
  getResponse = ok(JSON.stringify({})),
): Promise<{ batch: () => unknown; calls: () => string[] }> {
  const { runner, lines } = fakeRunner({ [GET]: getResponse });
  const temp = fakeTempFiles();
  const program = new Command().exitOverride();
  registerSkillsCommand(program, {
    runner,
    tempFiles: temp.files,
    log: (l) => logs.push(l),
    error: (l) => errors.push(l),
    packageRoot: pkgRoot,
    shadowSources: [],
  });
  await program.parseAsync([
    'node',
    'jeeves',
    'skills',
    ...args,
    '-w',
    workspace,
  ]);
  return { batch: temp.batch, calls: lines };
}

describe('jeeves skills install', () => {
  it('--managed wires the generic folder only', async () => {
    const { batch } = await runCli(['install', '--managed']);

    expect(batch()).toEqual([
      { path: 'skills.load.extraDirs', value: [path.join(pkgRoot, 'skills')] },
    ]);
    expect(logs).not.toContain(DRY_RUN_COMPLETE);
    expect(process.exitCode).toBeUndefined();
  });

  it('--self-hosted wires both folders', async () => {
    const { batch } = await runCli(['install', '--self-hosted']);

    expect(batch()).toEqual([
      {
        path: 'skills.load.extraDirs',
        value: [
          path.join(pkgRoot, 'skills'),
          path.join(pkgRoot, 'skills-self-hosted'),
        ],
      },
    ]);
  });

  it('rejects --managed with --self-hosted before touching OpenClaw', async () => {
    let calls: () => string[] = () => [];
    await expect(
      (async () => {
        ({ calls } = await runCli(['install', '--managed', '--self-hosted']));
      })(),
    ).rejects.toThrow(/managed.*self-hosted|self-hosted.*managed/i);
    expect(calls()).toEqual([]);
  });

  it('--dry-run applies nothing and prints the dry-run footer', async () => {
    const { batch, calls } = await runCli(['install', '--dry-run']);

    expect(batch()).toBeUndefined();
    expect(calls()).toEqual([GET]);
    expect(logs.at(-1)).toBe(DRY_RUN_COMPLETE);
  });

  it('exits non-zero when OpenClaw fails', async () => {
    await runCli(['install'], failed('boom'));

    expect(errors.some((l) => l.startsWith('skills install: FAILED'))).toBe(
      true,
    );
    expect(process.exitCode).toBe(1);
  });
});

describe('jeeves skills uninstall and status', () => {
  it('uninstall removes exactly this package’s entries', async () => {
    const other = path.join(workspace, 'other-skills');
    const extraDirs = [path.join(pkgRoot, 'skills'), other];
    const { batch } = await runCli(
      ['uninstall'],
      ok(JSON.stringify({ load: { extraDirs } })),
    );

    expect(batch()).toEqual([
      { path: 'skills.load.extraDirs', value: [other] },
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it('status is read-only and reports the inferred mode', async () => {
    const { calls } = await runCli(['status']);

    expect(calls()).toEqual([GET]);
    expect(logs[0]).toMatch(/mode/i);
    expect(process.exitCode).toBeUndefined();
  });
});

describe('skillsModeFromCli', () => {
  it.each([
    [{}, undefined],
    [{ managed: true }, 'managed'],
    [{ selfHosted: true }, 'selfHosted'],
  ])('maps %j to %s', (opts, mode) => {
    expect(skillsModeFromCli(opts)).toBe(mode);
  });

  it('throws when both flags are given', () => {
    expect(() =>
      skillsModeFromCli({ managed: true, selfHosted: true }),
    ).toThrow();
  });
});
