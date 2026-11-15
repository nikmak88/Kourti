/**
 * Language-aware dates and numbers.
 *
 * date-fns prints English month/day names unless given a locale. Use these
 * helpers (or pass `{ locale: dateLocale() }` to date-fns yourself) so dates
 * follow the UI language:
 *
 *   formatDate(date, 'PPP')            // 15 Nov 2026  /  15 Νοε 2026
 *   formatDate(date, 'EEEE d MMMM')    // Sunday 15 November / Κυριακή 15 Νοεμβρίου
 *   formatRelative(date)               // 3 days ago / πριν από 3 ημέρες
 *   formatNumber(1234.5)               // 1,234.5 / 1.234,5
 *   formatCurrency(321, 'EUR')         // €321.00 / 321,00 €
 *
 * Prefer the localized tokens P, PP, PPP, PPPP, p (date/time) over fixed
 * orders like 'MM/dd/yyyy': they produce the right order for each language.
 */
import { format, formatDistanceToNow, type Locale } from 'date-fns';
import { el, enGB } from 'date-fns/locale';

import i18n from './index';

export function dateLocale(): Locale {
  return i18n.language === 'el' ? el : enGB;
}

/** Intl locale tag for numbers and Intl.DateTimeFormat. */
export function intlLocale(): string {
  return i18n.language === 'el' ? 'el-GR' : 'en-GB';
}

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** date-fns `format` with the UI locale. Returns '' for empty/invalid input. */
export function formatDate(value: DateInput, pattern = 'PP'): string {
  const d = toDate(value);
  return d ? format(d, pattern, { locale: dateLocale() }) : '';
}

/** "3 days ago" / "πριν από 3 ημέρες". */
export function formatRelative(value: DateInput, addSuffix = true): string {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix, locale: dateLocale() }) : '';
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), options).format(value);
}

export function formatCurrency(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency }).format(value);
}
