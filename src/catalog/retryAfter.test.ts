import { describe, expect, it } from 'vitest';

import { retryAfterMs } from './retryAfter.js';

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);

describe('retryAfterMs', () => {
  it.each([
    ['0', 0],
    ['30', 30_000],
    ['007', 7000],
    ['9007199254740', 9_007_199_254_740_000],
  ])('reads delta-seconds %j as %d ms', (value, ms) => {
    expect(retryAfterMs(value, NOW)).toBe(ms);
  });

  it.each([
    ['IMF-fixdate', 'Sat, 31 Oct 2026 12:01:30 GMT'],
    ['RFC 850', 'Saturday, 31-Oct-26 12:01:30 GMT'],
    ['asctime, two-digit day', 'Sat Oct 31 12:01:30 2026'],
  ])('reads the %s form as GMT', (_label, value) => {
    expect(retryAfterMs(value, NOW)).toBe(90_000);
  });

  it('reads an asctime single-digit day padded with a space', () => {
    expect(retryAfterMs('Mon Nov  2 12:00:00 2026', NOW)).toBe(
      2 * 24 * 3600 * 1000,
    );
  });

  it('reads an RFC 850 year more than 50 years ahead as the previous century', () => {
    // '99' would be 2099 (73 years ahead), so it is 1999: in the past.
    expect(retryAfterMs('Sunday, 31-Oct-99 12:00:00 GMT', NOW)).toBe(0);
    // '70' is 2070, 44 years ahead: kept in this century.
    expect(retryAfterMs('Friday, 31-Oct-70 12:00:00 GMT', NOW)).toBe(
      Date.UTC(2070, 9, 31, 12) - NOW,
    );
  });

  it('never returns a negative wait for a past date', () => {
    expect(retryAfterMs('Sat, 31 Oct 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it.each([
    ['', ''],
    ['a word', 'soon'],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
    ['a short junk date', 'Mon 1'],
    ['a day name and a year', 'abc 2026'],
    ['a date without GMT', 'Sat, 31 Oct 2026 12:01:30'],
    ['a non-GMT zone', 'Sat, 31 Oct 2026 12:01:30 UTC'],
    ['a lowercase month', 'Sat, 31 oct 2026 12:01:30 GMT'],
    ['an impossible date', 'Sat, 31 Feb 2026 12:01:30 GMT'],
    ['an impossible time', 'Sat, 31 Oct 2026 25:01:30 GMT'],
    ['an hour that rolls into the next day', 'Fri, 30 Oct 2026 24:00:00 GMT'],
    ['a day that rolls into the next month', 'Sat, 32 Oct 2026 12:00:00 GMT'],
    ['a minute out of range', 'Sat, 31 Oct 2026 12:60:00 GMT'],
    ['a second out of range', 'Sat, 31 Oct 2026 12:00:61 GMT'],
    ['day 00', 'Sat, 00 Oct 2026 12:00:00 GMT'],
    ['a junk prefix', 'xSat, 31 Oct 2026 12:01:30 GMT'],
    ['a junk suffix', 'Sat, 31 Oct 2026 12:01:30 GMTx'],
    ['an ISO date', '2026-10-31T12:01:30Z'],
    ['seconds overflowing a safe integer', '9'.repeat(400)],
  ])('is undefined for %s', (_label, value) => {
    expect(retryAfterMs(value, NOW)).toBeUndefined();
  });

  it('is undefined when the header is absent', () => {
    expect(retryAfterMs(null, NOW)).toBeUndefined();
  });
});
