/**
 * Matter-taxonomy CSV parsing for the backend (kourtictl matter-types import).
 * Same format and rules as the web app's src/lib/taxonomyCsv.ts - keep the two
 * in sync.
 */
export interface TaxonomyRow {
  type: string;
  issue: string;
  type_description?: string;
  issue_description?: string;
  /** Optional 5th column: 'gr_ordinary' | 'gr_small_claims' (procedural deadlines of the type). */
  deadline_rules?: string;
}

function detectDelimiter(firstLine: string): string {
  const counts = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

/** RFC-4180-ish parser: quoted fields, "" escapes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const HEADER_HINTS = ['type', 'issue', 'τύπος', 'τυπος', 'θέμα', 'θεμα', 'κατηγορία', 'κατηγορια'];

export function csvToTaxonomyRows(text: string): { rows: TaxonomyRow[]; skippedHeader: boolean } {
  const table = parseCsv(text);
  let skippedHeader = false;
  if (table.length) {
    const first = table[0].map((c) => c.trim().toLowerCase());
    if (first.some((c) => HEADER_HINTS.some((h) => c.includes(h)))) {
      table.shift();
      skippedHeader = true;
    }
  }
  const rows = table
    .map((r) => ({
      type: (r[0] ?? '').trim(),
      issue: (r[1] ?? '').trim(),
      type_description: (r[2] ?? '').trim() || undefined,
      issue_description: (r[3] ?? '').trim() || undefined,
      deadline_rules: (r[4] ?? '').trim() || undefined,
    }))
    .filter((r) => r.type);
  return { rows, skippedHeader };
}
