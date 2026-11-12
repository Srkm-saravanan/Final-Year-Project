import type {
  ColumnSchemaInfo,
  DatasetQualityReport,
  HistogramBin,
  InferredColumnType,
  NumericColumnStats,
  SalesRecord,
  TabularCell,
  TabularRow,
} from '../types/cortex';

export const SALES_DATASET_COLUMNS = [
  'date',
  'region',
  'product',
  'category',
  'quantity',
  'revenue',
];

export function salesRecordsToTabularRows(records: SalesRecord[]): TabularRow[] {
  return records.map((rec) => ({
    date: rec.date,
    region: rec.region,
    product: rec.product,
    category: rec.category,
    quantity: rec.quantity,
    revenue: rec.revenue,
  }));
}

function isIsoLikeDate(value: string): boolean {
  if (!/^\d{4}[-/]\d{2}[-/]\d{2}/.test(value) && !/^\d{2}[-/]\d{2}[-/]\d{4}/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function classifySingleCell(cell: TabularCell): Exclude<InferredColumnType, 'empty'> {
  if (typeof cell === 'number' && Number.isFinite(cell)) return 'number';
  if (typeof cell === 'boolean') return 'boolean';
  if (typeof cell === 'string' && isIsoLikeDate(cell)) return 'date';
  return 'string';
}

export function analyzeDatasetSchema(
  columns: string[],
  rows: TabularRow[]
): ColumnSchemaInfo[] {
  return columns.map((colName) => {
    const typeCounts: Record<Exclude<InferredColumnType, 'empty'>, number> = {
      number: 0,
      date: 0,
      boolean: 0,
      string: 0,
    };

    const distinctSet = new Set<string>();
    const sampleValues: string[] = [];
    let missingCount = 0;
    let nonNullCount = 0;

    rows.forEach((row) => {
      const val = row[colName];
      if (val === null || val === undefined || val === '') {
        missingCount += 1;
        return;
      }
      nonNullCount += 1;
      const cellType = classifySingleCell(val);
      typeCounts[cellType] += 1;
      const strVal = String(val);
      distinctSet.add(strVal);
      if (sampleValues.length < 3 && !sampleValues.includes(strVal)) {
        sampleValues.push(strVal);
      }
    });

    let inferredType: InferredColumnType = 'empty';
    let invalidCount = 0;

    if (nonNullCount > 0) {
      const entries = Object.entries(typeCounts) as [
        Exclude<InferredColumnType, 'empty'>,
        number,
      ][];
      entries.sort((a, b) => b[1] - a[1]);
      inferredType = entries[0][0];

      // Count cells that deviate from the dominant non-string type (numbers, dates, booleans)
      if (inferredType !== 'string') {
        invalidCount = nonNullCount - typeCounts[inferredType];
      }
    }

    return {
      name: colName,
      inferredType,
      totalRows: rows.length,
      nonNullCount,
      missingCount,
      invalidCount,
      distinctCount: distinctSet.size,
      sampleValues,
    };
  });
}

function computePercentile(sortedAsc: number[], percentile: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const index = (sortedAsc.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedAsc[lower];
  const weight = index - lower;
  return sortedAsc[lower] * (1 - weight) + sortedAsc[upper] * weight;
}

export function computeNumericColumnStats(
  columnName: string,
  rows: TabularRow[]
): NumericColumnStats | null {
  const numbers: number[] = [];
  let missingCount = 0;
  let invalidCount = 0;

  rows.forEach((row) => {
    const val = row[columnName];
    if (val === null || val === undefined || val === '') {
      missingCount += 1;
      return;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      numbers.push(val);
      return;
    }
    invalidCount += 1;
  });

  if (numbers.length === 0) {
    return null;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;

  // Sample standard deviation for n > 1, 0 for single value
  const varianceSum = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
  const stdDev = count > 1 ? Math.sqrt(varianceSum / (count - 1)) : 0;

  const q1 = computePercentile(sorted, 0.25);
  const median = computePercentile(sorted, 0.5);
  const q3 = computePercentile(sorted, 0.75);

  // Build 8 equal-width histogram bins across [min, max]
  const binCount = 8;
  const histogram: HistogramBin[] = [];
  if (max === min) {
    histogram.push({
      rangeLabel: formatCompactNumber(min),
      min,
      max,
      count,
      pct: 100,
    });
  } else {
    const width = (max - min) / binCount;
    const counts = new Array<number>(binCount).fill(0);
    sorted.forEach((val) => {
      const rawIdx = Math.floor((val - min) / width);
      const idx = Math.min(Math.max(rawIdx, 0), binCount - 1);
      counts[idx] += 1;
    });
    const maxBinCount = Math.max(...counts, 1);
    for (let i = 0; i < binCount; i += 1) {
      const binMin = min + i * width;
      const binMax = min + (i + 1) * width;
      histogram.push({
        rangeLabel: `${formatCompactNumber(binMin)} – ${formatCompactNumber(binMax)}`,
        min: binMin,
        max: binMax,
        count: counts[i],
        pct: Math.round((counts[i] / maxBinCount) * 100),
      });
    }
  }

  return {
    columnName,
    count,
    missingCount,
    invalidCount,
    min,
    max,
    mean,
    stdDev,
    median,
    q1,
    q3,
    histogram,
  };
}

export function computeDatasetQualityReport(
  columns: string[],
  rows: TabularRow[],
  schema: ColumnSchemaInfo[]
): DatasetQualityReport {
  const totalRows = rows.length;
  const colCount = columns.length;

  if (totalRows === 0 || colCount === 0) {
    return {
      hasRowData: false,
      totalRows: 0,
      totalCells: 0,
      validCells: 0,
      missingCells: 0,
      invalidCells: 0,
      duplicateRows: 0,
      completenessPct: 0,
      validityPct: 0,
      uniquenessPct: 0,
      overallIndexPct: 0,
    };
  }

  const totalCells = totalRows * colCount;
  const missingCells = schema.reduce((acc, col) => acc + col.missingCount, 0);
  const invalidCells = schema.reduce((acc, col) => acc + col.invalidCount, 0);
  const nonNullCells = totalCells - missingCells;
  const validCells = Math.max(nonNullCells - invalidCells, 0);

  const uniqueSignatures = new Set<string>();
  let duplicateRows = 0;
  rows.forEach((row) => {
    const sig = JSON.stringify(columns.map((c) => row[c] ?? null));
    if (uniqueSignatures.has(sig)) {
      duplicateRows += 1;
    } else {
      uniqueSignatures.add(sig);
    }
  });

  const completenessPct = parseFloat(((nonNullCells / totalCells) * 100).toFixed(1));
  const validityPct =
    nonNullCells > 0 ? parseFloat(((validCells / nonNullCells) * 100).toFixed(1)) : 0;
  const uniquenessPct = parseFloat((((totalRows - duplicateRows) / totalRows) * 100).toFixed(1));
  const overallIndexPct = parseFloat(
    (completenessPct * 0.45 + validityPct * 0.4 + uniquenessPct * 0.15).toFixed(1)
  );

  return {
    hasRowData: true,
    totalRows,
    totalCells,
    validCells,
    missingCells,
    invalidCells,
    duplicateRows,
    completenessPct,
    validityPct,
    uniquenessPct,
    overallIndexPct,
  };
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  if (Math.abs(value) >= 100) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

