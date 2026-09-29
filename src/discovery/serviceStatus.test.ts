import { describe, expect, it } from 'vitest';

import { serviceStatus } from './serviceStatus';

describe('serviceStatus', () => {
  it('derives installed/running and keeps the scope and unit', () => {
    expect(serviceStatus('running', 'jeeves-runner.service', 'system')).toEqual(
      {
        state: 'running',
        installed: true,
        running: true,
        scope: 'system',
        unit: 'jeeves-runner.service',
      },
    );
    expect(serviceStatus('stopped', 'jeeves-runner.service', 'user')).toEqual({
      state: 'stopped',
      installed: true,
      running: false,
      scope: 'user',
      unit: 'jeeves-runner.service',
    });
  });

  it('drops the scope when nothing is installed', () => {
    expect(
      serviceStatus('not_installed', 'jeeves-runner.service', 'system'),
    ).toEqual({
      state: 'not_installed',
      installed: false,
      running: false,
      unit: 'jeeves-runner.service',
    });
  });
});
