import { describe, expect, it } from 'vitest';

import { CommandFailedError } from './commandRunner.js';
import { type CommandResult } from './commandRunner.js';
import { failed, fakeRunner, ok } from './fakePorts.js';
import { DEFAULT_GATEWAY_WAIT, type GatewayWaitPorts } from './gatewayWait.js';
import {
  detectGateway,
  type GatewayTracker,
  isGatewayDisconnect,
  runPluginInstall,
} from './pluginInstallStep.js';

const META = {
  pluginId: 'jeeves-meta-openclaw',
  packageName: '@karmaniverous/jeeves-meta-openclaw',
  version: '2.0.0',
};
const INSTALL =
  'openclaw plugins install npm:@karmaniverous/jeeves-meta-openclaw';
const PROBE = 'openclaw gateway status';
const LIST = 'openclaw plugins list --json';

const DISCONNECT = failed(
  '[state-migrations] Plugin "jeeves-meta-openclaw" data/settings upgrade is unfinished ... status=pending\ngateway closed (1006): abnormal closure',
);

const listing = (entry?: Record<string, unknown>): CommandResult =>
  ok(
    JSON.stringify({ plugins: entry ? [{ id: META.pluginId, ...entry }] : [] }),
  );

const setup = (script: Parameters<typeof fakeRunner>[0]) => {
  const fake = fakeRunner(script);
  const log: string[] = [];
  const slept: number[] = [];
  let now = 0;
  const ports: GatewayWaitPorts = {
    runner: fake.runner,
    log: (l) => log.push(l),
    clock: () => now,
    sleep: (ms) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    },
    policy: DEFAULT_GATEWAY_WAIT,
  };
  const gateway: GatewayTracker = { present: true, reloadPending: false };
  return { fake, log, slept, ports, gateway, elapsed: () => now };
};

const short = (l: string): string =>
  l.startsWith(PROBE)
    ? 'probe'
    : l.startsWith(INSTALL)
      ? 'install'
      : l.startsWith(LIST)
        ? 'list'
        : l;

describe('runPluginInstall', () => {
  it('clean success: settles, installs, no waits', async () => {
    const { fake, slept, ports, gateway } = setup({});
    await runPluginInstall(ports, gateway, META);
    expect(fake.lines().map(short)).toEqual(['probe', 'install']);
    expect(slept).toEqual([]);
  });

  it('disconnect, then verified: waits for the gateway, verifies, warns and continues', async () => {
    const { fake, log, slept, ports, gateway } = setup({
      [INSTALL]: DISCONNECT,
      [PROBE]: [ok(), failed('timeout'), failed('timeout'), ok()],
      [LIST]: listing({ version: '2.0.0', enabled: true, status: 'loaded' }),
    });
    await runPluginInstall(ports, gateway, META);
    expect(fake.lines().map(short)).toEqual([
      'probe',
      'install',
      'probe',
      'probe',
      'probe',
      'list',
    ]);
    expect(slept).toEqual([2_000, 4_000]);
    expect(log.at(-1)).toBe(
      'warning: jeeves-meta-openclaw@2.0.0 is installed and enabled although its install lost the gateway connection; continuing',
    );
  });

  it('disconnect, then verified once the install converges', async () => {
    const { ports, gateway } = setup({
      [INSTALL]: DISCONNECT,
      [LIST]: [
        listing(),
        listing({ version: '2.0.0', enabled: true, status: 'loaded' }),
      ],
    });
    await expect(runPluginInstall(ports, gateway, META)).resolves.toBe(
      undefined,
    );
  });

  it('disconnect, plugin missing: fails naming the plugin', async () => {
    const { ports, gateway, elapsed } = setup({
      [INSTALL]: DISCONNECT,
      [LIST]: listing(),
    });
    const error = await runPluginInstall(ports, gateway, META).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /^Installing jeeves-meta-openclaw@2\.0\.0 lost its OpenClaw gateway connection and could not be verified after 180s: plugin not installed\./,
    );
    expect((error as Error).cause).toBeInstanceOf(CommandFailedError);
    expect(elapsed()).toBe(DEFAULT_GATEWAY_WAIT.budgetMs);
  });

  it('disconnect, wrong version: fails with the observed version', async () => {
    const { ports, gateway } = setup({
      [INSTALL]: DISCONNECT,
      [LIST]: listing({ version: '1.9.0', enabled: true }),
    });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toThrow(
      /plugin installed at 1\.9\.0, expected 2\.0\.0/,
    );
  });

  it('disconnect, installed but disabled: fails', async () => {
    const { ports, gateway } = setup({
      [INSTALL]: DISCONNECT,
      [LIST]: listing({ version: '2.0.0', enabled: false, status: 'disabled' }),
    });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toThrow(
      /installed at 2\.0\.0 but not enabled \(status: disabled\)/,
    );
  });

  it('disconnect, gateway never answers: times out with the last probe', async () => {
    const { fake, ports, gateway, elapsed } = setup({
      [INSTALL]: DISCONNECT,
      [PROBE]: [ok(), failed('connect ECONNREFUSED 127.0.0.1:18789')],
    });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toThrow(
      /after 180s: the gateway did not answer \(last probe: openclaw gateway status --require-rpc --timeout 10000 exited 1 \(connect ECONNREFUSED 127\.0\.0\.1:18789\)\)/,
    );
    expect(fake.lines().map(short)).not.toContain('list');
    expect(elapsed()).toBe(DEFAULT_GATEWAY_WAIT.budgetMs);
  });

  it('genuine install failure fails fast, even next to a disconnect message', async () => {
    const { fake, slept, ports, gateway } = setup({
      [INSTALL]: failed(
        'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/x\ngateway closed (1006)',
      ),
    });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toBeInstanceOf(
      CommandFailedError,
    );
    expect(fake.lines().map(short)).toEqual(['probe', 'install']);
    expect(slept).toEqual([]);
  });

  it('any other install failure fails fast', async () => {
    const { fake, ports, gateway } = setup({
      [INSTALL]: failed('No matching version found for x@9.9.9'),
    });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toThrow(
      /No matching version/,
    );
    expect(fake.lines().map(short)).toEqual(['probe', 'install']);
  });

  it('pauses after a config write, then waits for the busy gateway', async () => {
    const { fake, log, slept, ports, gateway } = setup({
      [PROBE]: [failed('timeout'), ok()],
    });
    gateway.reloadPending = true;
    await runPluginInstall(ports, gateway, META);
    expect(fake.lines().map(short)).toEqual(['probe', 'probe', 'install']);
    expect(slept).toEqual([3_000, 2_000]);
    expect(log[0]).toMatch(
      /^OpenClaw gateway is busy \(.*\); waiting up to 180s before installing jeeves-meta-openclaw@2\.0\.0$/,
    );
    expect(gateway.reloadPending).toBe(false);
  });

  it('fails before the install when the gateway does not settle', async () => {
    const { fake, ports, gateway } = setup({ [PROBE]: failed('timeout') });
    await expect(runPluginInstall(ports, gateway, META)).rejects.toThrow(
      /^OpenClaw gateway did not answer within 180s before installing jeeves-meta-openclaw@2\.0\.0/,
    );
    expect(fake.lines().map(short)).not.toContain('install');
  });

  it('installs without settle waits when no gateway was detected', async () => {
    const { fake, ports, gateway } = setup({});
    gateway.present = false;
    await runPluginInstall(ports, gateway, META);
    expect(fake.lines().map(short)).toEqual(['install']);
  });
});

describe('detectGateway', () => {
  it('reports a running gateway', async () => {
    const { ports, log } = setup({});
    await expect(detectGateway(ports)).resolves.toEqual({
      present: true,
      reloadPending: false,
    });
    expect(log).toEqual([]);
  });

  it('reports and logs a missing gateway', async () => {
    const { ports, log } = setup({ [PROBE]: failed('not running', 1) });
    await expect(detectGateway(ports)).resolves.toEqual({
      present: false,
      reloadPending: false,
    });
    expect(log[0]).toMatch(/^no running OpenClaw gateway answered/);
  });
});

describe('isGatewayDisconnect', () => {
  const err = (stderr: string) =>
    new CommandFailedError('openclaw plugins install x', failed(stderr));

  it.each([
    ['gateway closed (1006): abnormal closure', true],
    ['Gateway closed unexpectedly', true],
    ['Plugin "x" data/settings upgrade is unfinished', true],
    ['npm error code E404', false],
    ['npm error code ETARGET; gateway closed (1006)', false],
    ['install policy blocked', false],
  ])('%s -> %s', (stderr, expected) => {
    expect(isGatewayDisconnect(err(stderr))).toBe(expected);
  });

  it('is false for non-command errors', () => {
    expect(isGatewayDisconnect(new Error('gateway closed (1006)'))).toBe(false);
  });
});
