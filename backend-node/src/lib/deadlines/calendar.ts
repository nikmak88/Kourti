// Pure calendar helpers for the deadline engine. Dates are 'YYYY-MM-DD' strings;
// all arithmetic runs on UTC midnights so no local time zone can shift a day.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Parse 'YYYY-MM-DD' into a UTC-midnight epoch (ms). Throws RangeError if invalid. */
export function parseDate(s: string): number {
  const m = DATE_RE.exec(s);
  if (!m) throw new RangeError(`Invalid date (expected YYYY-MM-DD): ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar date: ${s}`);
  }
  return t;
}

export function formatDate(t: number): string {
  const d = new Date(t);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(s: string, n: number): string {
  return formatDate(parseDate(s) + n * DAY_MS);
}

/** Same day-of-month n months later, clamped to the last day of the target month. */
export function addMonths(s: string, n: number): string {
  const d = new Date(parseDate(s));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return formatDate(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(s: string): number {
  return new Date(parseDate(s)).getUTCDay();
}

export function isWeekend(s: string): boolean {
  const w = dayOfWeek(s);
  return w === 0 || w === 6;
}

/** Inclusive day difference b − a. */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}
