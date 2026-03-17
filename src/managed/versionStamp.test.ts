import { describe, expect, it } from 'vitest';

import {
  formatBeginMarker,
  formatEndMarker,
  shouldWrite,
} from './versionStamp';

describe('versionStamp', () => {
  describe('formatBeginMarker', () => {
    it('should include marker text, version, and timestamp', () => {
      const result = formatBeginMarker('BEGIN JEEVES PLATFORM TOOLS', '0.1.0');
      expect(result).toMatch(
        /^<!-- BEGIN JEEVES PLATFORM TOOLS \| core:0\.1\.0 \| \d{4}-\d{2}-\d{2}T.+ -->$/,
      );
    });
  });

  describe('formatEndMarker', () => {
    it('should format simple end marker', () => {
      expect(formatEndMarker('END JEEVES PLATFORM TOOLS')).toBe(
        '<!-- END JEEVES PLATFORM TOOLS -->',
      );
    });
  });

  describe('shouldWrite', () => {
    it('should write when no existing stamp', () => {
      expect(shouldWrite('0.1.0', undefined)).toBe(true);
    });

    it('should write when my version equals stamped version', () => {
      expect(
        shouldWrite('0.1.0', {
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
      ).toBe(true);
    });

    it('should write when my version is newer', () => {
      expect(
        shouldWrite('0.2.0', {
          version: '0.1.0',
          timestamp: new Date().toISOString(),
        }),
      ).toBe(true);
    });

    it('should skip when my version is older and stamp is fresh', () => {
      expect(
        shouldWrite('0.1.0', {
          version: '0.2.0',
          timestamp: new Date().toISOString(),
        }),
      ).toBe(false);
    });

    it('should write when my version is older but stamp is stale', () => {
      const staleTimestamp = new Date(
        Date.now() - 10 * 60 * 1000,
      ).toISOString();
      expect(
        shouldWrite('0.1.0', {
          version: '0.2.0',
          timestamp: staleTimestamp,
        }),
      ).toBe(true);
    });

    it('should respect custom staleness threshold', () => {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      // 1 minute threshold — 2 minutes ago should be stale
      expect(
        shouldWrite(
          '0.1.0',
          { version: '0.2.0', timestamp: twoMinAgo },
          60_000,
        ),
      ).toBe(true);
      // 5 minute threshold — 2 minutes ago should be fresh
      expect(
        shouldWrite(
          '0.1.0',
          { version: '0.2.0', timestamp: twoMinAgo },
          5 * 60 * 1000,
        ),
      ).toBe(false);
    });
  });
});
