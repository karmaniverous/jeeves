import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORTS,
  META_PORT,
  RUNNER_PORT,
  SERVER_PORT,
  WATCHER_PORT,
} from './ports';

describe('port constants', () => {
  it('should have correct individual port values', () => {
    expect(SERVER_PORT).toBe(1934);
    expect(WATCHER_PORT).toBe(1936);
    expect(RUNNER_PORT).toBe(1937);
    expect(META_PORT).toBe(1938);
  });

  it('should map service names to ports', () => {
    expect(DEFAULT_PORTS['server']).toBe(1934);
    expect(DEFAULT_PORTS['watcher']).toBe(1936);
    expect(DEFAULT_PORTS['runner']).toBe(1937);
    expect(DEFAULT_PORTS['meta']).toBe(1938);
  });
});
