'use client';

import React, { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from 'react';
import { X, Upload, ChevronRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { readSheet } from 'read-excel-file/browser';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'map' | 'preview' | 'assign';

const CRM_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Job Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'priority', label: 'Priority' },
];

function autoDetect(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const patterns: Record<string, RegExp> = {
    firstName: /first[\s_-]?name/i,
    lastName: /last[\s_-]?name/i,
    company: /company|org(anization)?|account/i,
    title: /title|position|role|job/i,
    email: /e[\s-]?mail/i,
    phone: /phone|tel(ephone)?|mobile/i,
    priority: /priority|tier/i,
  };
  for (const [field, re] of Object.entries(patterns)) {
    const match = headers.find((h) => re.test(h));
    if (match) map[field] = match;
  }
  return map;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

interface DuplicateInfo {
  row: number;
  matchType: 'email' | 'name_company' | 'phone';
  existingLeadId: string;
  existingSummary: string;
  incoming: { firstName?: string; lastName?: string; company?: string; email?: string };
}

interface DupSummary {
  total: number;
  toImport: number;
  exactDuplicates: number;
  possibleMatches: number;
  rowsWithErrors: number;
  duplicates: DuplicateInfo[];
  errorRows: { row: number; reason: string }[];
}

type Resolution = 'skip' | 'update' | 'import';

const MATCH_LABELS: Record<DuplicateInfo['matchType'], string> = {
  email: 'Email match',
  name_company: 'Name + company',
  phone: 'Phone match',
};

const inputClass =
  'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
const labelClass =
  'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

const STAGES = [
  { value: 'new', label: 'New' },
  { value: 'sequence_active', label: 'Sequence Active' },
  { value: 'replied', label: 'Replied' },
  { value: 'meeting_booked', label: 'Meeting Booked' },
];

export default function CSVImportModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dupSummary, setDupSummary] = useState<DupSummary | null>(null);
  const [defaultResolution, setDefaultResolution] = useState<Resolution>('skip');
  const [rowResolutions, setRowResolutions] = useState<Record<string, Resolution>>({});

  // Assignment state
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([]);
  const [assignSdr, setAssignSdr] = useState('');
  const [assignCampaign, setAssignCampaign] = useState('');
  const [assignStage, setAssignStage] = useState('new');
  const [assignSequence, setAssignSequence] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then((r) => r.ok ? r.json() : []),
      fetch('/api/campaigns').then((r) => r.ok ? r.json() : []),
      fetch('/api/sequences').then((r) => r.ok ? r.json() : []),
    ]).then(([u, c, s]) => {
      setUsers(Array.isArray(u) ? u : []);
      setCampaigns(Array.isArray(c) ? c : []);
      setSequences(Array.isArray(s) ? s : []);
    }).catch(() => {});
  }, []);

  const processFile = useCallback((file: File) => {
    const isCSV = file.name.endsWith('.csv');
    const isXLSX = file.name.endsWith('.xlsx');
    if (!isCSV && !isXLSX) {
      showToast('Please select a .csv or .xlsx file', 'error');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();

    if (isXLSX) {
      readSheet(file)
        .then((json) => {
          if (!json.length) { showToast('Spreadsheet appears to be empty', 'error'); return; }
          const headers = json[0].map((value) => String(value ?? ''));
          const rows = json.slice(1).map((row) => row.map((value) => String(value ?? '')));
          if (!headers.length) { showToast('No columns found', 'error'); return; }
          setCsvHeaders(headers);
          setCsvRows(rows);
          setFieldMap(autoDetect(headers));
          setStep('map');
        })
        .catch(() => {
          showToast('Failed to parse XLSX file', 'error');
        });
    } else {
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);
        if (headers.length === 0) { showToast('CSV appears to be empty', 'error'); return; }
        setCsvHeaders(headers);
        setCsvRows(rows);
        setFieldMap(autoDetect(headers));
        setStep('map');
      };
      reader.readAsText(file);
    }
  }, [showToast]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const setMapping = (crmField: string, csvHeader: string) => {
    setFieldMap((prev) => ({ ...prev, [crmField]: csvHeader }));
  };

  const getColIndex = (header: string) => csvHeaders.indexOf(header);

  const getCellValue = (row: string[], crmField: string): string => {
    const header = fieldMap[crmField];
    if (!header) return '';
    const idx = getColIndex(header);
    return idx >= 0 ? (row[idx] ?? '') : '';
  };

  const buildLeadsPayload = () =>
    csvRows.map((row) => ({
      firstName: getCellValue(row, 'firstName'),
      lastName: getCellValue(row, 'lastName'),
      company: getCellValue(row, 'company'),
      title: getCellValue(row, 'title'),
      email: getCellValue(row, 'email'),
      phone: getCellValue(row, 'phone'),
      priority: getCellValue(row, 'priority') || 'warm',
    }));

  const canImport = !!(fieldMap.firstName || fieldMap.lastName || fieldMap.email);

  const handleRunDryRun = async () => {
    if (!canImport) {
      showToast('Map at least First Name + Last Name or Email before continuing.', 'error');
      return;
    }
    setDryRunning(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: buildLeadsPayload(), dryRun: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setDupSummary(data);
        setRowResolutions({});
        setDefaultResolution('skip');
        setStep('preview');
      } else {
        showToast(data.error ?? 'Failed to analyze file', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setDryRunning(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: buildLeadsPayload(),
          assignedToId: assignSdr || undefined,
          campaignId: assignCampaign || undefined,
          initialStage: assignStage,
          sequenceId: assignSequence || undefined,
          defaultResolution,
          resolutions: rowResolutions,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          `Imported ${data.imported} lead${data.imported !== 1 ? 's' : ''}${data.updated > 0 ? ` · ${data.updated} updated` : ''}${data.skipped > 0 ? ` · ${data.skipped} skipped` : ''}`,
          'success'
        );
        onSuccess?.();
        onClose();
      } else {
        showToast(data.error ?? 'Import failed', 'error');
      }
    } catch {
      showToast('Network error during import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'map', label: 'Map Fields' },
    { key: 'preview', label: 'Dedup Check' },
    { key: 'assign', label: 'Assign' },
  ];
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  const previewRows = csvRows.slice(0, 5);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import leads from CSV"
          className="glass-card rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-card-border shrink-0">
            <div>
              <h2 className="font-display font-bold text-sm text-text-primary">Import Leads</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                Step {stepIdx + 1} of {STEPS.length} — {STEPS[stepIdx].label}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="px-6 pt-4 shrink-0">
            <div className="flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <React.Fragment key={s.key}>
                  <div className="flex items-center gap-1">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                        i === stepIdx
                          ? 'bg-brand-red text-white'
                          : i < stepIdx
                          ? 'bg-brand-red/20 text-brand-red'
                          : 'bg-card-border text-text-muted'
                      }`}
                    >
                      {i < stepIdx ? '✓' : i + 1}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold uppercase ${
                        i === stepIdx ? 'text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 overflow-y-auto flex-1">

            {/* STEP 1: Upload */}
            {step === 'upload' && (
              <div className="space-y-4">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-brand-red bg-brand-red/5'
                      : 'border-card-border hover:border-brand-red/50 hover:bg-card-bg/50'
                  }`}
                >
                  <Upload className="w-8 h-8 text-text-muted" />
                  <div className="text-center">
                    <p className="text-xs font-semibold text-text-primary">
                      Drop your CSV here, or click to browse
                    </p>
                    <p className="text-[10px] text-text-muted mt-1">Accepts .csv and .xlsx files</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                <div className="rounded-lg bg-card-bg border border-card-border p-3">
                  <p className={labelClass}>Expected columns (order doesn&apos;t matter)</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {CRM_FIELDS.map((f) => (
                      <span
                        key={f.key}
                        className="px-2 py-0.5 rounded-md bg-background border border-card-border text-[10px] font-mono text-text-secondary"
                      >
                        {f.label}
                        {f.required && <span className="text-brand-red ml-0.5">*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Map Fields */}
            {step === 'map' && (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary">{csvRows.length}</span> rows detected
                  {fileName && (
                    <span className="text-text-muted ml-1.5 font-mono text-[10px]">({fileName})</span>
                  )}
                </p>
                <div className="rounded-xl border border-card-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-card-border bg-card-bg">
                        <th className="text-left px-3 py-2 text-[10px] font-bold font-mono text-text-muted uppercase tracking-wide w-1/2">CRM Field</th>
                        <th className="text-left px-3 py-2 text-[10px] font-bold font-mono text-text-muted uppercase tracking-wide w-1/2">CSV Column</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CRM_FIELDS.map((f, i) => (
                        <tr key={f.key} className={`border-b border-card-border last:border-0 ${i % 2 === 0 ? '' : 'bg-card-bg/30'}`}>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {f.label}{f.required && <span className="text-brand-red ml-0.5">*</span>}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={fieldMap[f.key] ?? ''}
                              onChange={(e) => setMapping(f.key, e.target.value)}
                              className={inputClass}
                            >
                              <option value="">— skip —</option>
                              {csvHeaders.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* STEP 3: Dedup Check + Preview */}
            {step === 'preview' && dupSummary && (
              <div className="space-y-4">
                {/* Summary table */}
                <div className="rounded-xl border border-card-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-card-bg border-b border-card-border">
                    <p className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wide">Import Summary</p>
                  </div>
                  <div className="divide-y divide-card-border">
                    {[
                      { label: 'Total rows in file', value: dupSummary.total, icon: null, color: 'text-text-primary' },
                      { label: 'New leads to import', value: dupSummary.toImport, icon: '✅', color: 'text-emerald-500' },
                      { label: 'Exact duplicates found', value: dupSummary.exactDuplicates, icon: '⚠️', color: 'text-amber-500' },
                      { label: 'Possible matches', value: dupSummary.possibleMatches, icon: '⚠️', color: 'text-amber-400' },
                      { label: 'Rows with errors', value: dupSummary.rowsWithErrors, icon: '❌', color: 'text-brand-red' },
                    ].map(({ label, value, icon, color }) => (
                      <div key={label} className="flex items-center justify-between px-4 py-2 text-xs">
                        <span className="text-text-secondary">{icon && <span className="mr-1.5">{icon}</span>}{label}</span>
                        <span className={`font-bold font-mono ${color}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Row preview */}
                <div>
                  <p className={labelClass}>First {previewRows.length} rows preview</p>
                  <div className="rounded-xl border border-card-border overflow-x-auto">
                    <table className="w-full text-xs min-w-[360px]">
                      <thead>
                        <tr className="border-b border-card-border bg-card-bg">
                          {CRM_FIELDS.filter((f) => fieldMap[f.key]).map((f) => (
                            <th key={f.key} className="text-left px-3 py-2 text-[10px] font-bold font-mono text-text-muted uppercase tracking-wide whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-card-border last:border-0">
                            {CRM_FIELDS.filter((f) => fieldMap[f.key]).map((f) => (
                              <td key={f.key} className="px-3 py-2 text-text-secondary truncate max-w-[100px]">
                                {getCellValue(row, f.key) || <span className="text-text-muted italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Duplicate resolution (SKILL.md §24) */}
                {dupSummary.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className={labelClass}>Resolve {dupSummary.duplicates.length} duplicate{dupSummary.duplicates.length !== 1 ? 's' : ''}</p>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-text-muted font-mono uppercase">All:</span>
                        {(['skip', 'update', 'import'] as Resolution[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => { setDefaultResolution(r); setRowResolutions({}); }}
                            className={`px-2 py-0.5 rounded-md border font-bold capitalize transition-colors ${
                              defaultResolution === r
                                ? 'bg-brand-red/10 border-brand-red/40 text-brand-red'
                                : 'bg-background border-card-border text-text-muted hover:text-text-primary'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-card-border overflow-hidden max-h-44 overflow-y-auto divide-y divide-card-border">
                      {dupSummary.duplicates.map((d) => (
                        <div key={d.row} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate">
                              Row {d.row}: {d.incoming.firstName} {d.incoming.lastName}
                              <span className="ml-1.5 text-[9px] font-mono uppercase text-amber-500">{MATCH_LABELS[d.matchType]}</span>
                            </p>
                            <p className="text-text-muted truncate">matches {d.existingSummary}</p>
                          </div>
                          <select
                            value={rowResolutions[String(d.row)] ?? defaultResolution}
                            onChange={(e) =>
                              setRowResolutions((prev) => ({ ...prev, [String(d.row)]: e.target.value as Resolution }))
                            }
                            className="bg-background border border-card-border rounded-md px-1.5 py-1 text-[10px] font-semibold text-text-primary focus:outline-none focus:border-brand-red shrink-0"
                          >
                            <option value="skip">Skip</option>
                            <option value="update">Update existing</option>
                            <option value="import">Import anyway</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-text-muted">
                      “Update existing” fills only empty fields on the matched lead; “Import anyway” creates a separate record.
                    </p>
                  </div>
                )}

                {/* Error report download (SKILL.md §24) */}
                {dupSummary.errorRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const csv = ['row,reason', ...dupSummary.errorRows.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)].join('\n');
                      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'import-errors.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="w-full py-2 border border-brand-red/30 bg-brand-red/5 hover:bg-brand-red/10 rounded-lg text-xs font-semibold text-brand-red transition-colors"
                  >
                    Download error report ({dupSummary.errorRows.length} row{dupSummary.errorRows.length !== 1 ? 's' : ''})
                  </button>
                )}

                {dupSummary.toImport === 0 && dupSummary.duplicates.length === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-600">All rows are duplicates or have errors. Nothing to import.</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Assign */}
            {step === 'assign' && (
              <div className="space-y-4">
                <p className="text-xs text-text-secondary">
                  Assign <span className="font-semibold text-text-primary">{dupSummary?.toImport ?? csvRows.length}</span> leads before importing.
                </p>

                <div>
                  <label className={labelClass}>Assign to Rep</label>
                  <select value={assignSdr} onChange={(e) => setAssignSdr(e.target.value)} className={inputClass}>
                    <option value="">— Current user (default) —</option>
                    {users.filter((u) => u.role === 'sdr' || u.role === 'leadgen').map((u) => (
                      <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.role.replace('_', ' ')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Campaign <span className="text-brand-red">*</span></label>
                  <select value={assignCampaign} onChange={(e) => setAssignCampaign(e.target.value)} className={inputClass} required>
                    <option value="">— Select a campaign —</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!assignCampaign && (
                    <p className="text-[10px] text-brand-red mt-1 font-mono">Campaign is required — all leads must belong to a campaign.</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Initial Stage</label>
                  <select value={assignStage} onChange={(e) => setAssignStage(e.target.value)} className={inputClass}>
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Auto-enroll in Sequence <span className="text-text-muted normal-case font-normal">(optional)</span></label>
                  <select value={assignSequence} onChange={(e) => setAssignSequence(e.target.value)} className={inputClass}>
                    <option value="">— No sequence —</option>
                    {sequences.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-emerald-600">
                    Ready to import {dupSummary?.toImport ?? csvRows.length} lead{(dupSummary?.toImport ?? csvRows.length) !== 1 ? 's' : ''}.
                    {dupSummary && dupSummary.duplicates.length > 0 && (
                      <span className="text-amber-600"> {dupSummary.duplicates.length} duplicate{dupSummary.duplicates.length !== 1 ? 's' : ''} will follow the resolution you chose.</span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-card-border shrink-0 flex gap-2">
            {step === 'upload' && (
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                Cancel
              </button>
            )}

            {step === 'map' && (
              <>
                <button type="button" onClick={() => setStep('upload')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleRunDryRun}
                  disabled={dryRunning}
                  className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {dryRunning ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Analyzing…</span></>
                  ) : 'Check for Duplicates'}
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                <button type="button" onClick={() => setStep('map')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep('assign')}
                  disabled={
                    !dupSummary ||
                    (dupSummary.toImport === 0 &&
                      !dupSummary.duplicates.some(
                        (d) => (rowResolutions[String(d.row)] ?? defaultResolution) !== 'skip'
                      ))
                  }
                  className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                  Assign & Import →
                </button>
              </>
            )}

            {step === 'assign' && (
              <>
                <button type="button" onClick={() => setStep('preview')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !assignCampaign}
                  className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {importing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Importing…</span></>
                  ) : `Confirm Import`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
