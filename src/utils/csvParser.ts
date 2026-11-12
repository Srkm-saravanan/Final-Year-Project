import type { TabularCell, TabularRow } from '../types/cortex';

export interface CsvParseSuccess {
  ok: true;
  columns: string[];
  rows: TabularRow[];
  warnings: string[];
}

export interface CsvParseFailure {
  ok: false;
  error: string;
}

export type CsvParseResult = CsvParseSuccess | CsvParseFailure;

const MISSING_TOKENS = new Set(['', 'null', 'nil', 'n/a', 'na', 'nan', 'undefined', '-']);
const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB browser safeguard

export function validateCsvFile(file: File): string | null {
  if (!file) {
    return 'No file was provided.';
  }
  if (file.size === 0) {
    return `"${file.name}" is empty (0 bytes). Select a populated CSV file.`;
  }
  if (file.size > MAX_CSV_BYTES) {
    return `"${file.name}" exceeds the 5 MB browser import limit.`;
  }
  const lowerName = file.name.toLowerCase();
  const allowedMime =
    file.type === '' ||
    file.type === 'text/csv' ||
    file.type === 'text/plain' ||
    file.type === 'application/csv' ||
    file.type === 'application/vnd.ms-excel';
  if (!lowerName.endsWith('.csv') && !allowedMime) {
    return `"${file.name}" does not appear to be a CSV file (type: ${file.type || 'unknown'}).`;
  }
  if (!lowerName.endsWith('.csv') && !file.type.includes('csv') && file.type !== 'text/plain') {
    return `Unsupported file format "${file.name}". Please upload a .csv file.`;
  }
  return null;
}

export function normalizeCellValue(raw: string): TabularCell {
  const trimmed = raw.trim();
  if (MISSING_TOKENS.has(trimmed.toLowerCase())) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Accept formatted numbers such as "1,250.50", "$ 99.5", "₹ 14,200", "-42.1"
  const numericCandidate = trimmed.replace(/^[₹$€£]\s*/, '').replace(/,/g, '');
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(numericCandidate)) {
    const num = Number(numericCandidate);
    if (Number.isFinite(num)) {
      return num;
    }
  }

  return trimmed;
}

/**
 * RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes (""),
 * embedded commas/newlines inside quotes, missing values, and malformed input reporting.
 */
export function parseCsvText(rawText: string): CsvParseResult {
  if (!rawText || !rawText.trim()) {
    return { ok: false, error: 'CSV input is empty.' };
  }

  // Strip UTF-8 BOM if present
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;

  // Reject binary payloads containing NUL bytes
  if (text.includes('\u0000')) {
    return {
      ok: false,
      error: 'Binary or non-text file detected. Upload a valid UTF-8 CSV file.',
    };
  }

  const matrix: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      currentField += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (currentField.length > 0) {
        // Unexpected quote mid-unquoted token: still reject if grossly malformed, or fail cleanly
        return {
          ok: false,
          error: `Malformed CSV quoting near row ${matrix.length + 1}. Ensure fields containing quotes are wrapped cleanly.`,
        };
      }
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      currentRow.push(currentField);
      currentField = '';
      if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      const hasContent = currentRow.some((cell) => cell.trim() !== '');
      if (hasContent) {
        matrix.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += ch;
    i += 1;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: 'Malformed CSV: unterminated quotation mark before end of file.',
    };
  }

  // Push trailing row if non-empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((cell) => cell.trim() !== '')) {
      matrix.push(currentRow);
    }
  }

  if (matrix.length === 0) {
    return { ok: false, error: 'CSV contains no readable header or records.' };
  }

  const rawHeaders = matrix[0];
  if (rawHeaders.length === 0 || rawHeaders.every((h) => h.trim() === '')) {
    return { ok: false, error: 'CSV header row contains no column names.' };
  }

  // Deduplicate and sanitize column names
  const seenHeaders = new Map<string, number>();
  const columns = rawHeaders.map((header, idx) => {
    const base = header.trim() || `column_${idx + 1}`;
    const prevCount = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, prevCount + 1);
    return prevCount === 0 ? base : `${base}_${prevCount + 1}`;
  });

  const dataRows = matrix.slice(1);
  if (dataRows.length === 0) {
    return {
      ok: false,
      error: 'CSV contains headers but zero data rows.',
    };
  }

  const warnings: string[] = [];
  let raggedRowCount = 0;

  const rows: TabularRow[] = dataRows.map((cells) => {
    if (cells.length !== columns.length) {
      raggedRowCount += 1;
    }
    const rowObj: TabularRow = {};
    columns.forEach((col, colIdx) => {
      const rawCell = colIdx < cells.length ? cells[colIdx] : '';
      rowObj[col] = normalizeCellValue(rawCell);
    });
    return rowObj;
  });

  if (raggedRowCount > 0) {
    warnings.push(
      `${raggedRowCount} row(s) had differing column counts and were normalized with null padding.`
    );
  }

  return {
    ok: true,
    columns,
    rows,
    warnings,
  };
}

