import { describe, expect, it, vi } from 'vitest';

import { onPluginDispose } from './lifecycle.js';
import type { PluginApi } from './types.js';

const base: PluginApi = { registerTool: vi.fn() };

describe('onPluginDispose', () => {
  it('prefers api.lifecycle.onDispose', () => {
    const onDispose = vi.fn(() => () => undefined);
    const registerRuntimeLifecycle = vi.fn();
    const dispose = vi.fn();
    const api: PluginApi = {
      ...base,
      lifecycle: { onDispose, registerRuntimeLifecycle },
    };
    expect(onPluginDispose(api, 'cache', dispose)).toBe(true);
    expect(onDispose).toHaveBeenCalledWith(dispose);
    expect(registerRuntimeLifecycle).not.toHaveBeenCalled();
  });

  it('falls back to registerRuntimeLifecycle', () => {
    const registerRuntimeLifecycle = vi.fn();
    const dispose = vi.fn();
    const api: PluginApi = { ...base, lifecycle: { registerRuntimeLifecycle } };
    expect(onPluginDispose(api, 'cache', dispose)).toBe(true);
    expect(registerRuntimeLifecycle).toHaveBeenCalledWith({
      id: 'cache',
      dispose,
    });
  });

  it('returns false when the host has no lifecycle API', () => {
    expect(onPluginDispose(base, 'cache', vi.fn())).toBe(false);
  });
});
