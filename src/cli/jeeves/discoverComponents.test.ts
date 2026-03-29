import { Command } from '@commander-js/extra-typings';
import { describe, expect, it } from 'vitest';

import {
  discoverComponentPackages,
  registerComponentProxies,
} from './discoverComponents';

describe('discoverComponentPackages', { timeout: 15_000 }, () => {
  it('should return an array', () => {
    const result = discoverComponentPackages();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return strings for any discovered packages', () => {
    const result = discoverComponentPackages();
    for (const name of result) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('should not include openclaw packages', () => {
    const result = discoverComponentPackages();
    for (const name of result) {
      expect(name).not.toContain('openclaw');
    }
  });
});

describe('registerComponentProxies', () => {
  it('should register proxy commands for each component', () => {
    const program = new Command();
    registerComponentProxies(program, ['watcher', 'runner']);

    const cmdNames = program.commands.map((c) => c.name());
    expect(cmdNames).toContain('watcher');
    expect(cmdNames).toContain('runner');
  });

  it('should register zero commands when no components found', () => {
    const program = new Command();
    registerComponentProxies(program, []);
    expect(program.commands).toHaveLength(0);
  });

  it('should set correct description', () => {
    const program = new Command();
    registerComponentProxies(program, ['meta']);

    const metaCmd = program.commands.find((c) => c.name() === 'meta');
    expect(metaCmd).toBeDefined();
    expect(metaCmd!.description()).toContain('jeeves-meta');
  });
});
