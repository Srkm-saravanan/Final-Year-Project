import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Inbox,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Table as TableIcon,
  Upload,
  X,
} from 'lucide-react';
import { useAppUI, useAuth, useDataFabric } from '../../context/CortexContext';
import type { DataSourceItem, TabularRow } from '../../types/cortex';
import { parseCsvText, validateCsvFile } from '../../utils/csvParser';
import {
  analyzeDatasetSchema,
  computeDatasetQualityReport,
  computeNumericColumnStats,
  formatCompactNumber,
  SALES_DATASET_COLUMNS,
  salesRecordsToTabularRows,
} from '../../utils/datasetStats';

const CURRENCY_COLUMN_HINT = /(revenue|amount|price|cost|sales|profit|budget|spend|value)/i;

export const DataExplorer: React.FC = () => {
  const { currency } = useAppUI();
  const { hasPermission } = useAuth();
  const canWriteDatasets = hasPermission('datasets:write');
  const {
    dataSources,
    addDataSource,
    salesRecords,
    customDatasets,
    registerUploadedDataset,
  } = useDataFabric();

  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    () => dataSources.find((ds) => ds.id === 'ds-sales')?.id ?? dataSources[0]?.id ?? ''
  );
  const [activeTab, setActiveTab] = useState<'Table' | 'Columns' | 'Profile' | 'Quality'>('Table');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfileCol, setSelectedProfileCol] = useState<string>('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newDsName, setNewDsName] = useState('');
  const [newDsType, setNewDsType] = useState<DataSourceItem['type']>('ERP');
  const [newDsCategory, setNewDsCategory] = useState<DataSourceItem['category']>('Operations');
  const [newDsRecords, setNewDsRecords] = useState('10,000');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep selectedSourceId valid if sources reload or clear
  useEffect(() => {
    if (dataSources.length === 0) {
      setSelectedSourceId('');
      return;
    }
    const stillExists = dataSources.some((ds) => ds.id === selectedSourceId);
    if (!stillExists) {
      setSelectedSourceId(
        dataSources.find((ds) => ds.id === 'ds-sales')?.id ?? dataSources[0].id
      );
    }
  }, [dataSources, selectedSourceId]);

  const activeSource = useMemo(
    () => dataSources.find((ds) => ds.id === selectedSourceId) ?? dataSources[0] ?? null,
    [dataSources, selectedSourceId]
  );

  // Resolve uniform tabular data ONLY from genuinely available records (uploaded CSV or ds-sales)
  const resolvedDataset = useMemo<{
    columns: string[];
    rows: TabularRow[];
    originLabel: string;
    isSalesSchema: boolean;
  }>(() => {
    if (!activeSource) {
      return { columns: [], rows: [], originLabel: 'None', isSalesSchema: false };
    }

    const uploaded = customDatasets[activeSource.id];
    if (uploaded) {
      return {
        columns: uploaded.columns,
        rows: uploaded.rows,
        originLabel: `Uploaded CSV (${uploaded.fileName})`,
        isSalesSchema: false,
      };
    }

    if (activeSource.id === 'ds-sales' && salesRecords.length > 0) {
      return {
        columns: SALES_DATASET_COLUMNS,
        rows: salesRecordsToTabularRows(salesRecords),
        originLabel: 'Loaded Sales Database Snapshot',
        isSalesSchema: true,
      };
    }

    return {
      columns: [],
      rows: [],
      originLabel: 'Metadata Connector (No Local Row Payload)',
      isSalesSchema: false,
    };
  }, [activeSource, customDatasets, salesRecords]);

  const schemaInfo = useMemo(
    () => analyzeDatasetSchema(resolvedDataset.columns, resolvedDataset.rows),
    [resolvedDataset.columns, resolvedDataset.rows]
  );

  const numericColumns = useMemo(
    () => schemaInfo.filter((col) => col.inferredType === 'number').map((col) => col.name),
    [schemaInfo]
  );

  useEffect(() => {
    if (numericColumns.length === 0) {
      setSelectedProfileCol('');
      return;
    }
    if (!numericColumns.includes(selectedProfileCol)) {
      const preferred =
        numericColumns.find((name) => /revenue|amount|total|sales/i.test(name)) ??
        numericColumns[0];
      setSelectedProfileCol(preferred);
    }
  }, [numericColumns, selectedProfileCol]);

  const activeNumericStats = useMemo(() => {
    if (!selectedProfileCol || resolvedDataset.rows.length === 0) return null;
    return computeNumericColumnStats(selectedProfileCol, resolvedDataset.rows);
  }, [selectedProfileCol, resolvedDataset.rows]);

  const qualityReport = useMemo(
    () =>
      computeDatasetQualityReport(
        resolvedDataset.columns,
        resolvedDataset.rows,
        schemaInfo
      ),
    [resolvedDataset.columns, resolvedDataset.rows, schemaInfo]
  );

  const filteredAndSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = !q
      ? resolvedDataset.rows
      : resolvedDataset.rows.filter((row) =>
          resolvedDataset.columns.some((col) =>
            String(row[col] ?? '')
              .toLowerCase()
              .includes(q)
          )
        );

    if (!sortCol || !resolvedDataset.columns.includes(sortCol)) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const valA = a[sortCol];
      const valB = b[sortCol];
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [resolvedDataset.columns, resolvedDataset.rows, searchQuery, sortAsc, sortCol]);

  const handleSortColumn = (colName: string) => {
    if (sortCol === colName) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(colName);
      setSortAsc(true);
    }
  };

  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so re-uploading the same filename still triggers onChange
    e.target.value = '';
    setUploadError(null);
    setUploadNotice(null);

    if (!file) return;

    const metaError = validateCsvFile(file);
    if (metaError) {
      setUploadError(metaError);
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (!parsed.ok) {
        setUploadError(parsed.error);
        return;
      }

      const displayName = file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim();
      const newSourceId = await registerUploadedDataset({
        name: displayName || file.name,
        category: activeSource?.category ?? 'Operations',
        fileName: file.name,
        columns: parsed.columns,
        rows: parsed.rows,
      });

      setSelectedSourceId(newSourceId);
      setSortCol(null);
      setSearchQuery('');
      setActiveTab('Profile');
      const warnSuffix =
        parsed.warnings.length > 0 ? ` Note: ${parsed.warnings.join(' ')}` : '';
      setUploadNotice(
        `Imported "${file.name}" (${parsed.rows.length} rows, ${parsed.columns.length} columns) and persisted to PostgreSQL.${warnSuffix}`
      );
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : `Failed to import "${file.name}". Ensure it is an accessible UTF-8 text CSV.`
      );
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleCreateSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDsName.trim()) return;
    setUploadError(null);
    try {
      const created = await addDataSource({
        name: newDsName.trim(),
        type: newDsType,
        category: newDsCategory,
        recordsCount: newDsRecords,
      });
      setSelectedSourceId(created.id);
      setNewDsName('');
      setShowAddModal(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to connect data source.');
    }
  };

  const formatCellDisplay = (colName: string, value: unknown): React.ReactNode => {
    if (value === null || value === undefined || value === '') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono">
          NULL
        </span>
      );
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (resolvedDataset.isSalesSchema && CURRENCY_COLUMN_HINT.test(colName)) {
        if (currency === 'USD') {
          return `$ ${((value / 1e7) * 0.12).toFixed(4)}M`;
        }
        return `₹ ${value.toLocaleString('en-IN')}`;
      }
      return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
    }
    return String(value);
  };

  const gaugeRadius = 42;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeProgress = qualityReport.hasRowData
    ? gaugeCircumference * (1 - qualityReport.overallIndexPct / 100)
    : gaugeCircumference;

  return (
    <div className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 xl:p-10 h-full flex flex-col gap-6">
      {/* Hidden File Input for CSV Imports */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvFileChange}
        aria-label="Upload CSV Dataset"
        className="hidden"
      />

      {/* Upload feedback banners */}
      {uploadError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-rose-300">CSV Import Rejected</span>
              <span>{uploadError}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-rose-300 hover:text-white"
            aria-label="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadNotice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-emerald-300">Dataset Loaded</span>
              <span>{uploadNotice}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="text-emerald-300 hover:text-white"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 flex-1 min-h-0">
        {/* Left Panel: Data Sources (3 cols) */}
        <div className="lg:col-span-3 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 flex flex-col gap-4 shadow-sm h-full">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Data Sources ({dataSources.length})
            </h3>
            {canWriteDatasets && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Connect
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {dataSources.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2 border border-dashed border-[#1c2944] rounded-xl h-48">
                <Inbox className="w-8 h-8 text-slate-600" />
                <span>No Data Sources</span>
              </div>
            ) : (
              dataSources.map((ds) => {
                const isSelected = activeSource?.id === ds.id;
                const hasInspectionData =
                  Boolean(customDatasets[ds.id]) ||
                  (ds.id === 'ds-sales' && salesRecords.length > 0);
                return (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => {
                      setSelectedSourceId(ds.id);
                      setSearchQuery('');
                      setSortCol(null);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[#12203b] border-blue-500/50 shadow-sm'
                        : 'bg-[#0a101d] border-[#162238] hover:border-[#233252]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-white truncate">{ds.name}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                          hasInspectionData
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {hasInspectionData ? 'Rows Ready' : ds.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{ds.recordsCount} records</span>
                      <span className="font-mono text-slate-500">{ds.lastUpdated}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="pt-3 border-t border-[#162138]">
            {canWriteDatasets ? (
              <>
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 text-xs font-semibold text-blue-300 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Import Custom CSV Batch
                </button>
                <p className="text-[10px] text-slate-500 text-center mt-1.5">
                  Parses UTF-8 CSVs cleanly and persists rows to PostgreSQL
                </p>
              </>
            ) : (
              <p className="text-[10px] text-slate-500 text-center py-1">
                Dataset import restricted to Analyst &amp; Admin roles
              </p>
            )}
          </div>
        </div>

        {/* Center Panel: Dataset Viewer & Analytics Tabs (6 cols) */}
        <div className="lg:col-span-6 bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 flex flex-col gap-4 shadow-sm min-h-0">
          {/* Header & Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#162138] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {activeSource ? activeSource.name : 'No Dataset Selected'}
                </h2>
                {activeSource && (
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[#111c33] border border-[#233252] text-blue-300">
                    {activeSource.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {resolvedDataset.originLabel}
                {qualityReport.hasRowData
                  ? ` · ${qualityReport.totalRows.toLocaleString()} rows × ${resolvedDataset.columns.length} columns`
                  : ''}
              </p>
            </div>

            <div className="flex items-center bg-[#0a101d] p-1 rounded-xl border border-[#1b2740]">
              {(['Table', 'Columns', 'Profile', 'Quality'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Honest Empty State for Metadata-Only Connectors */}
          {!qualityReport.hasRowData ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-[#1c2944] rounded-xl bg-[#0a101d] space-y-4">
              <div className="p-3 rounded-2xl bg-[#111c33] border border-[#233252]">
                <FileSpreadsheet className="w-8 h-8 text-blue-400" />
              </div>
              <div className="max-w-md space-y-1.5">
                <h4 className="text-sm font-bold text-white">
                  {activeSource
                    ? `No Local Row Sample Bundled for "${activeSource.name}"`
                    : 'No Active Dataset Available'}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {activeSource
                    ? `Connector "${activeSource.type}" reports ${activeSource.recordsCount} upstream records (${activeSource.status}). Because direct backend database streaming is deferred to Phase C, upload a CSV extract to inspect rows, compute column statistics, and audit data quality.`
                    : 'Upload a CSV file or select the loaded Sales Database dataset to inspect table records and statistical distributions.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV Dataset
                </button>
                {salesRecords.length > 0 && activeSource?.id !== 'ds-sales' && (
                  <button
                    type="button"
                    onClick={() => setSelectedSourceId('ds-sales')}
                    className="px-4 py-2 rounded-xl bg-[#111c33] hover:bg-[#192847] border border-[#233252] text-xs font-semibold text-slate-200 transition-colors"
                  >
                    Switch to Sales Database ({salesRecords.length} rows)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: TABLE */}
              {activeTab === 'Table' && (
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Filter ${resolvedDataset.rows.length} rows across ${resolvedDataset.columns.length} columns...`}
                      className="w-full bg-[#0a101d] border border-[#1c2944] rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex-1 overflow-auto border border-[#162238] rounded-xl bg-[#0a101d]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-[#111c33] border-b border-[#1c2944] z-10">
                        <tr>
                          {resolvedDataset.columns.map((col) => (
                            <th
                              key={col}
                              onClick={() => handleSortColumn(col)}
                              className="py-2.5 px-3 font-semibold text-slate-300 cursor-pointer hover:text-white select-none whitespace-nowrap"
                            >
                              <span className="inline-flex items-center gap-1">
                                {col}
                                {sortCol === col && (
                                  <span className="text-blue-400 font-mono">
                                    {sortAsc ? '↑' : '↓'}
                                  </span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#142038]">
                        {filteredAndSortedRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={resolvedDataset.columns.length}
                              className="py-10 text-center text-slate-500 text-xs"
                            >
                              No rows matched filter "{searchQuery}".
                            </td>
                          </tr>
                        ) : (
                          filteredAndSortedRows.slice(0, 250).map((row, idx) => (
                            <tr key={idx} className="hover:bg-[#111c33]/60 transition-colors">
                              {resolvedDataset.columns.map((col) => (
                                <td
                                  key={col}
                                  className="py-2.5 px-3 text-slate-200 font-mono whitespace-nowrap"
                                >
                                  {formatCellDisplay(col, row[col])}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>
                      Showing {Math.min(filteredAndSortedRows.length, 250)} of{' '}
                      {filteredAndSortedRows.length} matching rows
                    </span>
                    <span>Click column headers to sort</span>
                  </div>
                </div>
              )}

              {/* TAB 2: COLUMNS */}
              {activeTab === 'Columns' && (
                <div className="flex-1 overflow-auto border border-[#162238] rounded-xl bg-[#0a101d]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#111c33] border-b border-[#1c2944]">
                      <tr className="text-slate-400">
                        <th className="py-2.5 px-3 font-semibold">Column Name</th>
                        <th className="py-2.5 px-3 font-semibold">Type</th>
                        <th className="py-2.5 px-3 font-semibold">Non-Null</th>
                        <th className="py-2.5 px-3 font-semibold">Missing</th>
                        <th className="py-2.5 px-3 font-semibold">Distinct</th>
                        <th className="py-2.5 px-3 font-semibold">Sample Values</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#142038]">
                      {schemaInfo.map((col) => (
                        <tr key={col.name} className="hover:bg-[#111c33]/50">
                          <td className="py-2.5 px-3 font-semibold text-white font-mono">
                            {col.name}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {col.inferredType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 font-mono">
                            {col.nonNullCount}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-mono ${
                              col.missingCount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'
                            }`}
                          >
                            {col.missingCount}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 font-mono">
                            {col.distinctCount}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 truncate max-w-[160px]">
                            {col.sampleValues.join(', ') || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {col.inferredType === 'number' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedProfileCol(col.name);
                                  setActiveTab('Profile');
                                }}
                                className="text-[11px] text-blue-400 hover:underline font-medium"
                              >
                                Profile Stats →
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-600">Categorical</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: PROFILE */}
              {activeTab === 'Profile' && (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {numericColumns.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-[#1c2944] bg-[#0a101d] text-xs text-slate-400">
                      This dataset contains no numeric columns for statistical distribution profiling.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <Layers className="w-4 h-4 text-teal-400" />
                          <span>Numeric Field Profile:</span>
                        </div>
                        <select
                          aria-label="Profile Column"
                          value={selectedProfileCol}
                          onChange={(e) => setSelectedProfileCol(e.target.value)}
                          className="bg-[#111c33] border border-[#233252] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                        >
                          {numericColumns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>

                      {activeNumericStats && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                              <span className="text-[11px] text-slate-400 block">Minimum</span>
                              <span className="text-sm font-bold text-white font-mono mt-1 block">
                                {formatCompactNumber(activeNumericStats.min)}
                              </span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                              <span className="text-[11px] text-slate-400 block">Maximum</span>
                              <span className="text-sm font-bold text-white font-mono mt-1 block">
                                {formatCompactNumber(activeNumericStats.max)}
                              </span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                              <span className="text-[11px] text-slate-400 block">Mean (Average)</span>
                              <span className="text-sm font-bold text-blue-400 font-mono mt-1 block">
                                {formatCompactNumber(activeNumericStats.mean)}
                              </span>
                            </div>
                            <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                              <span className="text-[11px] text-slate-400 block">Std Deviation</span>
                              <span className="text-sm font-bold text-teal-400 font-mono mt-1 block">
                                {formatCompactNumber(activeNumericStats.stdDev)}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl bg-[#0a101d] border border-[#162238] text-xs">
                              <span className="text-slate-400 block">Median (P50)</span>
                              <span className="text-slate-100 font-mono font-semibold mt-0.5 block">
                                {formatCompactNumber(activeNumericStats.median)}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#0a101d] border border-[#162238] text-xs">
                              <span className="text-slate-400 block">Q1 – Q3 (IQR)</span>
                              <span className="text-slate-100 font-mono font-semibold mt-0.5 block">
                                {formatCompactNumber(activeNumericStats.q1)} –{' '}
                                {formatCompactNumber(activeNumericStats.q3)}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-[#0a101d] border border-[#162238] text-xs">
                              <span className="text-slate-400 block">Valid / Missing</span>
                              <span className="text-slate-100 font-mono font-semibold mt-0.5 block">
                                {activeNumericStats.count} valid · {activeNumericStats.missingCount} null
                              </span>
                            </div>
                          </div>

                          <div className="p-4 rounded-xl bg-[#0a101d] border border-[#162238] space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-white">
                                Value Distribution Histogram ({activeNumericStats.columnName})
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                n = {activeNumericStats.count} samples
                              </span>
                            </div>
                            <div className="space-y-2">
                              {activeNumericStats.histogram.map((bin) => (
                                <div key={bin.rangeLabel} className="space-y-1 text-[11px]">
                                  <div className="flex justify-between font-mono text-slate-300">
                                    <span>{bin.rangeLabel}</span>
                                    <span className="text-slate-400">{bin.count} rows</span>
                                  </div>
                                  <div className="w-full h-2 rounded-full bg-[#111c33] overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 rounded-full transition-all"
                                      style={{ width: `${Math.max(bin.pct, bin.count > 0 ? 6 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* TAB 4: QUALITY */}
              {activeTab === 'Quality' && (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                      <span className="text-[11px] text-slate-400 block">Completeness</span>
                      <span className="text-base font-bold text-emerald-400 font-mono mt-1 block">
                        {qualityReport.completenessPct}%
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {qualityReport.missingCells} missing cells
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                      <span className="text-[11px] text-slate-400 block">Type Validity</span>
                      <span className="text-base font-bold text-blue-400 font-mono mt-1 block">
                        {qualityReport.validityPct}%
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {qualityReport.invalidCells} type mismatches
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                      <span className="text-[11px] text-slate-400 block">Row Uniqueness</span>
                      <span className="text-base font-bold text-teal-400 font-mono mt-1 block">
                        {qualityReport.uniquenessPct}%
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {qualityReport.duplicateRows} duplicate rows
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#0a101d] border border-[#162238]">
                      <span className="text-[11px] text-slate-400 block">Valid Cells</span>
                      <span className="text-base font-bold text-white font-mono mt-1 block">
                        {qualityReport.validCells.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        of {qualityReport.totalCells.toLocaleString()} total
                      </span>
                    </div>
                  </div>

                  <div className="border border-[#162238] rounded-xl bg-[#0a101d] overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-[#111c33] border-b border-[#1c2944] text-slate-400">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Column</th>
                          <th className="py-2.5 px-3 font-semibold">Nulls</th>
                          <th className="py-2.5 px-3 font-semibold">Type Mismatches</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Field Completeness</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#142038]">
                        {schemaInfo.map((col) => {
                          const completeness =
                            col.totalRows > 0
                              ? (((col.totalRows - col.missingCount) / col.totalRows) * 100).toFixed(1)
                              : '0.0';
                          return (
                            <tr key={col.name}>
                              <td className="py-2.5 px-3 font-mono text-white">{col.name}</td>
                              <td
                                className={`py-2.5 px-3 font-mono ${
                                  col.missingCount > 0 ? 'text-amber-400' : 'text-slate-400'
                                }`}
                              >
                                {col.missingCount}
                              </td>
                              <td
                                className={`py-2.5 px-3 font-mono ${
                                  col.invalidCount > 0 ? 'text-rose-400' : 'text-slate-400'
                                }`}
                              >
                                {col.invalidCount}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-right text-slate-200">
                                {completeness}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Panel: Live Quality Score & Selected Column Telemetry (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {/* Quality Ring Card */}
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 flex flex-col items-center text-center shadow-sm">
            <h3 className="text-sm font-bold text-white self-start flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Data Quality Index
            </h3>

            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={gaugeRadius}
                  fill="none"
                  stroke="#162238"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={gaugeRadius}
                  fill="none"
                  stroke={
                    !qualityReport.hasRowData
                      ? '#334155'
                      : qualityReport.overallIndexPct >= 90
                        ? '#10b981'
                        : qualityReport.overallIndexPct >= 75
                          ? '#f59e0b'
                          : '#f43f5e'
                  }
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeProgress}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white font-mono">
                  {qualityReport.hasRowData ? `${qualityReport.overallIndexPct}%` : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {qualityReport.hasRowData ? 'Composite' : 'No Rows'}
                </span>
              </div>
            </div>

            <div className="w-full space-y-2.5 mt-4 text-xs text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Completeness</span>
                <span className="text-white font-mono">
                  {qualityReport.hasRowData ? `${qualityReport.completenessPct}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Type Validity</span>
                <span className="text-white font-mono">
                  {qualityReport.hasRowData ? `${qualityReport.validityPct}%` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Duplicate Rows</span>
                <span className="text-white font-mono">
                  {qualityReport.hasRowData ? qualityReport.duplicateRows : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Numeric Column Summary Card */}
          <div className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-5 flex-1 flex flex-col gap-3 shadow-sm">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-blue-400" />
              Column Profile
            </h3>

            {activeNumericStats ? (
              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded-lg bg-[#0a101d] border border-[#162238] flex justify-between items-center">
                  <span className="text-slate-400">Active Column</span>
                  <span className="text-blue-300 font-mono font-semibold">
                    {activeNumericStats.columnName}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Minimum</span>
                    <span className="text-white font-mono">
                      {formatCompactNumber(activeNumericStats.min)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Maximum</span>
                    <span className="text-white font-mono">
                      {formatCompactNumber(activeNumericStats.max)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Mean</span>
                    <span className="text-blue-300 font-mono">
                      {formatCompactNumber(activeNumericStats.mean)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Std Dev</span>
                    <span className="text-teal-300 font-mono">
                      {formatCompactNumber(activeNumericStats.stdDev)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Valid / Missing</span>
                    <span className="text-slate-200 font-mono">
                      {activeNumericStats.count} / {activeNumericStats.missingCount}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Select a dataset with loaded numeric fields (e.g., Sales Database or an uploaded
                CSV) to inspect live range, mean, and standard deviation telemetry.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Add Data Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSource}
            className="bg-[#0e1628] border border-[#1b2740] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Connect Enterprise Source</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Source Name</label>
                <input
                  type="text"
                  required
                  value={newDsName}
                  onChange={(e) => setNewDsName(e.target.value)}
                  placeholder="e.g., Snowflake Sales Warehouse"
                  className="w-full bg-[#111c33] border border-[#233252] rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Connector Type</label>
                  <select
                    value={newDsType}
                    onChange={(e) => setNewDsType(e.target.value as DataSourceItem['type'])}
                    className="w-full bg-[#111c33] border border-[#233252] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="ERP">ERP</option>
                    <option value="Database">Database</option>
                    <option value="CRM">CRM</option>
                    <option value="Supply Chain">Supply Chain</option>
                    <option value="HR">HR</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Category</label>
                  <select
                    value={newDsCategory}
                    onChange={(e) => setNewDsCategory(e.target.value as DataSourceItem['category'])}
                    className="w-full bg-[#111c33] border border-[#233252] rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Finance">Finance</option>
                    <option value="Operations">Operations</option>
                    <option value="Customers">Customers</option>
                    <option value="Supply Chain">Supply Chain</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Expected Records Count</label>
                <input
                  type="text"
                  value={newDsRecords}
                  onChange={(e) => setNewDsRecords(e.target.value)}
                  className="w-full bg-[#111c33] border border-[#233252] rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
              >
                Register Connector
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
