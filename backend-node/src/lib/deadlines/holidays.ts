// Greek public holidays that stop court deadlines from expiring (fixed + Orthodox Easter based).
import { addDays, formatDate } from './calendar.js';

export type HolidayKey =
  | 'new_year'
  | 'epiphany'
  | 'independence_day'
  | 'labour_day'
  | 'assumption'
  | 'ochi_day'
  | 'christmas'
  | 'synaxis_theotokos'
  | 'clean_monday'
  | 'good_friday'
  | 'easter_monday'
  | 'holy_spirit_monday';

const FIXED: Array<[month: number, day: number, key: HolidayKey]> = [
  [1, 1, 'new_year'],
  [1, 6, 'epiphany'],
  [3, 25, 'independence_day'],
  [5, 1, 'labour_day'],
  [8, 15, 'assumption'],
  [10, 28, 'ochi_day'],
  [12, 25, 'christmas'],
  [12, 26, 'synaxis_theotokos'],
];

const EASTER_OFFSETS: Array<[offset: number, key: HolidayKey]> = [
  [-48, 'clean_monday'],
  [-2, 'good_friday'],
  [1, 'easter_monday'],
  [50, 'holy_spirit_monday'],
];

/**
 * Orthodox Easter Sunday (Gregorian calendar) for 1900–2099: Meeus' Julian algorithm,
 * then +13 days Julian→Gregorian offset (valid for that range only).
 */
export function orthodoxEaster(year: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2099) {
    throw new RangeError(`orthodoxEaster supports 1900–2099, got ${year}`);
  }
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(formatDate(Date.UTC(year, month - 1, day)), 13);
}

const cache = new Map<number, Map<string, HolidayKey>>();

/** All public holidays of a year as date → key. */
export function greekHolidays(year: number): Map<string, HolidayKey> {
  let map = cache.get(year);
  if (map) return map;
  map = new Map();
  for (const [m, d, key] of FIXED) map.set(formatDate(Date.UTC(year, m - 1, d)), key);
  const easter = orthodoxEaster(year);
  for (const [off, key] of EASTER_OFFSETS) {
    const date = addDays(easter, off);
    if (!map.has(date)) map.set(date, key); // fixed holiday wins on collision (e.g. 1 May)
  }
  cache.set(year, map);
  return map;
}

/** Holiday key if `date` ('YYYY-MM-DD') is a Greek public holiday, else null. */
export function greekHoliday(date: string): HolidayKey | null {
  return greekHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

export function isGreekHoliday(date: string): boolean {
  return greekHoliday(date) !== null;
}
