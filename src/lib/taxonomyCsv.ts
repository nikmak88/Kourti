/**
 * CSV helpers for Settings → Matter types (import / export).
 *
 * Format (header row optional, column order fixed):
 *   matter_type,matter_issue,type_description,issue_description
 *   Family Law,Divorce,,
 *   Family Law,Maintenance,,Child and spousal maintenance
 *   Construction,,Building and engineering disputes,
 *
 * - One row per issue; repeat the type on each row. A row with an empty issue
 *   creates only the type.
 * - Separator: comma, semicolon (Excel in Greek/European settings) or tab -
 *   detected from the header/first line.
 * - Save from Excel as "CSV UTF-8" so Greek characters survive. A UTF-8 BOM is
 *   ignored.
 */

export interface TaxonomyRow {
  type: string;
  issue: string;
  type_description?: string;
  issue_description?: string;
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
    }))
    .filter((r) => r.type);
  return { rows, skippedHeader };
}

function csvCell(v: string | null | undefined): string {
  const s = v ?? '';
  return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Export with a BOM so Excel opens Greek text correctly. */
export function taxonomyToCsv(
  types: Array<{ name: string; description?: string | null; issues: Array<{ name: string; description?: string | null }> }>
): string {
  const lines = ['matter_type,matter_issue,type_description,issue_description'];
  for (const t of types) {
    if (!t.issues.length) {
      lines.push([t.name, '', t.description, ''].map(csvCell).join(','));
    }
    t.issues.forEach((i, idx) =>
      lines.push([t.name, i.name, idx === 0 ? t.description : '', i.description].map(csvCell).join(','))
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
