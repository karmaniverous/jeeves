/**
 * `Retry-After` parsing (spec 5a.5, RFC 9110 sections 10.2.3 and 5.6.7).
 *
 * @module
 */

const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const LONG_DAY = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const MONTH = `(${MONTHS.join('|')})`;
const TIME = '(\\d{2}):(\\d{2}):(\\d{2})';

/** `Sun, 06 Nov 1994 08:49:37 GMT` */
const IMF_FIXDATE = new RegExp(
  `^${DAY}, (\\d{2}) ${MONTH} (\\d{4}) ${TIME} GMT$`,
);
/** `Sunday, 06-Nov-94 08:49:37 GMT` (obsolete) */
const RFC_850 = new RegExp(
  `^${LONG_DAY}, (\\d{2})-${MONTH}-(\\d{2}) ${TIME} GMT$`,
);
/** `Sun Nov  6 08:49:37 1994` (obsolete; GMT by definition) */
const ASCTIME = new RegExp(`^${DAY} ${MONTH} ( \\d|\\d{2}) ${TIME} (\\d{4})$`);

/** Milliseconds in 50 years, for RFC 850's two-digit years. */
const FIFTY_YEARS_MS = 50 * 365.25 * 24 * 3600 * 1000;

/**
 * Epoch milliseconds of a UTC date, or `undefined` when a field is out of
 * range (e.g. 31 Feb or 25:00).
 */
function utc(
  year: number,
  month: string,
  day: string,
  [h, m, s]: string[],
): number | undefined {
  const mi = MONTHS.indexOf(month as (typeof MONTHS)[number]);
  const [d, hh, mm, ss] = [day, h, m, s].map(Number);
  // 60 allows a leap second; a day past the month's end rolls the month.
  if (hh > 23 || mm > 59 || ss > 60) return undefined;
  const ms = Date.UTC(year, mi, d, hh, mm, ss);
  return new Date(ms).getUTCMonth() === mi ? ms : undefined;
}

/**
 * Epoch milliseconds of an HTTP date in any of RFC 9110's three forms, read
 * as GMT.
 *
 * @param value - Header value.
 * @param now - Current epoch milliseconds (resolves RFC 850 years).
 * @returns Epoch milliseconds, or `undefined` when not an HTTP date.
 */
function httpDateMs(value: string, now: number): number | undefined {
  let m = IMF_FIXDATE.exec(value);
  if (m) return utc(Number(m[3]), m[2], m[1], m.slice(4));
  m = RFC_850.exec(value);
  if (m) {
    // A two-digit year more than 50 years ahead means the previous century.
    const yy = Number(m[3]);
    let year = 100 * Math.floor(new Date(now).getUTCFullYear() / 100) + yy;
    const at = utc(year, m[2], m[1], m.slice(4));
    if (at !== undefined && at - now > FIFTY_YEARS_MS) year -= 100;
    return utc(year, m[2], m[1], m.slice(4));
  }
  m = ASCTIME.exec(value);
  if (m) return utc(Number(m[6]), m[1], m[2], m.slice(3, 6));
  return undefined;
}

/**
 * Milliseconds to wait from a `Retry-After` value: delta-seconds, or an HTTP
 * date relative to `now`, never negative.
 *
 * @remarks
 * Values beyond `Number.MAX_SAFE_INTEGER` milliseconds count as unparseable.
 * A caller scheduling the retry with `setTimeout` must still cap the wait
 * (Node fires delays above 2^31-1 ms after 1 ms).
 *
 * @param value - Header value, or `null` when absent.
 * @param now - Current epoch milliseconds.
 * @returns Milliseconds, or `undefined` when missing or unparseable.
 */
export function retryAfterMs(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) {
    const ms = Number(value) * 1000;
    return Number.isSafeInteger(ms) ? ms : undefined;
  }
  const at = httpDateMs(value, now);
  return at === undefined ? undefined : Math.max(0, at - now);
}
