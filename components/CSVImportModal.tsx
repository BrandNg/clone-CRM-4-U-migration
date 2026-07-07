'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, DragEvent, ChangeEvent } from 'react';
import { CheckCircle, ChevronRight, Download, Loader2, Upload, X } from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';
import { useToast } from '@/context/ToastContext';
import { readApiError } from '@/lib/api/client';
import { detectImportPreset, VENDOR_1CH_FIELD_MAP } from '@/lib/leads/importRows';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'map' | 'context' | 'review' | 'confirm';
type Resolution = 'skip' | 'update' | 'import';
type EmailQualityMode = 'recommended' | 'strict' | 'aggressive';

type FieldDef = { key: string; label: string; group: string; required?: boolean };

const FIELD_DEFS: FieldDef[] = [
  { key: 'fullName', label: 'Full Name', group: 'Person' },
  { key: 'firstName', label: 'First Name', group: 'Person', required: true },
  { key: 'lastName', label: 'Last Name', group: 'Person', required: true },
  { key: 'title', label: 'Title', group: 'Person' },
  { key: 'department', label: 'Department', group: 'Person' },
  { key: 'seniority', label: 'Seniority', group: 'Person' },
  { key: 'linkedIn', label: 'Contact LinkedIn', group: 'Person' },
  { key: 'phone', label: 'Contact Phone', group: 'Person' },
  { key: 'secondaryPhone', label: 'Secondary Phone', group: 'Person' },
  { key: 'contactCountry', label: 'Contact Country', group: 'Person' },
  { key: 'email', label: 'Primary Email', group: 'Email', required: true },
  { key: 'emailValidation', label: 'Email Validation', group: 'Email' },
  { key: 'emailScore', label: 'Email Score', group: 'Email' },
  { key: 'alternateEmail', label: 'Alternate Email', group: 'Email' },
  { key: 'alternateEmailValidation', label: 'Alt Email Validation', group: 'Email' },
  { key: 'company', label: 'Company', group: 'Company', required: true },
  { key: 'website', label: 'Website', group: 'Company' },
  { key: 'companyPhone', label: 'Company Phone', group: 'Company' },
  { key: 'companyCountry', label: 'Company Country', group: 'Company' },
  { key: 'industry', label: 'Industry', group: 'Company' },
  { key: 'companyLinkedIn', label: 'Company LinkedIn', group: 'Company' },
  { key: 'staffCountRange', label: 'Staff Count Range', group: 'Company' },
  { key: 'importListName', label: 'Import List', group: 'Source' },
  { key: 'vendorSource', label: 'Vendor Source', group: 'Source' },
  { key: 'priority', label: 'Priority Override', group: 'Source' },
];

const inputClass =
  'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
const labelClass = 'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

interface DuplicateInfo {
  row: number;
  matchType: 'email' | 'name_company' | 'phone' | 'linkedin';
  existingLeadId: string;
  existingSummary: string;
  incoming: Record<string, string>;
}

interface DryRunSummary {
  total: number;
  toImport: number;
  exactDuplicates: number;
  possibleMatches: number;
  rowsWithErrors: number;
  riskyEmails: number;
  undeliverableEmails: number;
  duplicates: DuplicateInfo[];
  errorRows: { row: number; reason: string }[];
  warnings: { row: number; reason: string }[];
  previewRows: Record<string, unknown>[];
}

const MATCH_LABELS: Record<DuplicateInfo['matchType'], string> = {
  email: 'Email match',
  phone: 'Phone match',
  linkedin: 'LinkedIn match',
  name_company: 'Name + company',
};

const QUALITY_MODES: { value: EmailQualityMode; label: string; description: string }[] = [
  { value: 'recommended', label: 'Recommended', description: 'Import deliverable, risky, and unknown. Skip undeliverable.' },
  { value: 'strict', label: 'Strict', description: 'Only import deliverable emails.' },
  { value: 'aggressive', label: 'Aggressive', description: 'Import any non-empty email.' },
];

const autoDetect = (headers: string[]) => {
  const preset = detectImportPreset(headers);
  if (preset === 'vendor_1ch') return { preset, map: VENDOR_1CH_FIELD_MAP };

  const patterns: Record<string, RegExp> = {
    firstName: /first[\s_-]?name/i,
    lastName: /last[\s_-]?name/i,
    fullName: /full[\s_-]?name|contact name/i,
    company: /company|org(anization)?|account/i,
    title: /title|position|role|job/i,
    email: /e[\s-]?mail/i,
    phone: /phone|tel(ephone)?|mobile/i,
    linkedIn: /linkedin|linked in/i,
    website: /website|domain/i,
    industry: /industry/i,
    contactCountry: /contact country|country/i,
    priority: /priority|tier/i,
  };
  const map: Record<string, string> = {};
  for (const [field, pattern] of Object.entries(patterns)) {
    const match = headers.find((header) => pattern.test(header));
    if (match) map[field] = match;
  }
  return { preset, map };
};

const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  return { headers: splitLine(lines[0]), rows: lines.slice(1).map(splitLine) };
};

export default function CSVImportModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [preset, setPreset] = useState('generic');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [defaultResolution, setDefaultResolution] = useState<Resolution>('skip');
  const [rowResolutions, setRowResolutions] = useState<Record<string, Resolution>>({});
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [sequences, setSequences] = useState<{ id: string; name: string }[]>([]);
  const [assignedToId, setAssignedToId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [sequenceId, setSequenceId] = useState('');
  const [emailQualityMode, setEmailQualityMode] = useState<EmailQualityMode>('recommended');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/campaigns').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/sequences').then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([userData, campaignData, sequenceData]) => {
        setUsers(Array.isArray(userData) ? userData : []);
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
        setSequences(Array.isArray(sequenceData) ? sequenceData : []);
      })
      .catch(() => {});
  }, []);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, FieldDef[]>();
    for (const field of FIELD_DEFS) {
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups.entries()];
  }, []);

  const getCellValue = (row: string[], field: string) => {
    const header = fieldMap[field];
    if (!header) return '';
    const index = headers.indexOf(header);
    return index >= 0 ? row[index] ?? '' : '';
  };

  const buildPayload = () =>
    rows.map((row) => {
      const payload: Record<string, string> = {};
      for (const field of FIELD_DEFS) payload[field.key] = getCellValue(row, field.key);
      return payload;
    });

  const hasMinimumMapping = Boolean(
    fieldMap.company && fieldMap.email && (fieldMap.fullName || (fieldMap.firstName && fieldMap.lastName))
  );

  const processRows = useCallback((newHeaders: string[], newRows: string[][], newFileName: string) => {
    const detected = autoDetect(newHeaders);
    setHeaders(newHeaders);
    setRows(newRows);
    setFileName(newFileName);
    setPreset(detected.preset);
    setFieldMap(detected.map);
    setSummary(null);
    setRowResolutions({});
    setDefaultResolution('skip');
    setStep('map');
  }, []);

  const processFile = useCallback(
    (file: File) => {
      const lowerName = file.name.toLowerCase();
      const isCSV = lowerName.endsWith('.csv');
      const isXLSX = lowerName.endsWith('.xlsx');
      if (!isCSV && !isXLSX) {
        showToast('Please select a .csv or .xlsx file', 'error');
        return;
      }

      if (isXLSX) {
        readSheet(file)
          .then((sheet) => {
            if (sheet.length === 0) {
              showToast('Spreadsheet appears to be empty', 'error');
              return;
            }
            const newHeaders = sheet[0].map((value) => String(value ?? '').trim());
            const newRows = sheet.slice(1).map((row) => row.map((value) => String(value ?? '').trim()));
            processRows(newHeaders, newRows, file.name);
          })
          .catch(() => showToast('Failed to parse XLSX file', 'error'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const parsed = parseCSV(String(event.target?.result ?? ''));
        if (parsed.headers.length === 0) {
          showToast('CSV appears to be empty', 'error');
          return;
        }
        processRows(parsed.headers, parsed.rows, file.name);
      };
      reader.readAsText(file);
    },
    [processRows, showToast]
  );

  const runDryRun = async () => {
    if (!hasMinimumMapping) {
      showToast('Map company, email, and name fields before continuing.', 'error');
      return;
    }
    if (!campaignId) {
      showToast('Choose a campaign before duplicate check.', 'error');
      setStep('context');
      return;
    }

    setDryRunning(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: buildPayload(),
          dryRun: true,
          campaignId,
          assignedToId: assignedToId || undefined,
          sequenceId: sequenceId || undefined,
          emailQualityMode,
          filename: fileName,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to analyze file'));
      setSummary(await res.json());
      setRowResolutions({});
      setDefaultResolution('skip');
      setStep('review');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error', 'error');
    } finally {
      setDryRunning(false);
    }
  };

  const confirmImport = async () => {
    if (!campaignId) {
      showToast('Campaign is required.', 'error');
      setStep('context');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: buildPayload(),
          campaignId,
          assignedToId: assignedToId || undefined,
          sequenceId: sequenceId || undefined,
          emailQualityMode,
          defaultResolution,
          resolutions: rowResolutions,
          filename: fileName,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Import failed'));
      const data = await res.json();
      showToast(`Import queued: ${data.totalRows} rows. Batch ${data.batchId}`, 'success');
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error during import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const downloadErrorRows = () => {
    if (!summary) return;
    const csv = ['row,reason', ...summary.errorRows.map((row) => `${row.row},"${row.reason.replace(/"/g, '""')}"`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'Upload' },
    { key: 'map', label: 'Mapping' },
    { key: 'context', label: 'Context' },
    { key: 'review', label: 'Review' },
    { key: 'confirm', label: 'Confirm' },
  ];
  const stepIndex = steps.findIndex((item) => item.key === step);
  const previewRows = rows.slice(0, 5);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="glass-card rounded-2xl shadow-2xl w-full max-w-3xl pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[92vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-card-border shrink-0">
            <div>
              <h2 className="font-display font-bold text-sm text-text-primary">Bulk Upload Leads</h2>
              <p className="text-[10px] text-text-muted mt-0.5">
                Step {stepIndex + 1} of {steps.length} - {steps[stepIndex].label}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 pt-4 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {steps.map((item, index) => (
                <React.Fragment key={item.key}>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${index === stepIndex ? 'bg-brand-red text-white' : index < stepIndex ? 'bg-brand-red/20 text-brand-red' : 'bg-card-border text-text-muted'}`}>
                      {index < stepIndex ? 'OK' : index + 1}
                    </div>
                    <span className={`text-[10px] font-mono font-bold uppercase ${index === stepIndex ? 'text-text-primary' : 'text-text-muted'}`}>{item.label}</span>
                  </div>
                  {index < steps.length - 1 && <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="px-6 py-5 overflow-y-auto flex-1">
            {step === 'upload' && (
              <div className="space-y-4">
                <div
                  onDrop={(event: DragEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files?.[0];
                    if (file) processFile(file);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${isDragging ? 'border-brand-red bg-brand-red/5' : 'border-card-border hover:border-brand-red/50 hover:bg-card-bg/50'}`}
                >
                  <Upload className="w-8 h-8 text-text-muted" />
                  <div className="text-center">
                    <p className="text-xs font-semibold text-text-primary">Drop your leads file here, or click to browse</p>
                    <p className="text-[10px] text-text-muted mt-1">Accepts .csv and .xlsx files, including 1CH enrichment exports.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0];
                      if (file) processFile(file);
                    }}
                  />
                </div>
              </div>
            )}

            {step === 'map' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">{rows.length}</span> rows detected
                      {fileName && <span className="text-text-muted ml-1.5 font-mono text-[10px]">({fileName})</span>}
                    </p>
                    {preset === 'vendor_1ch' && (
                      <p className="text-[10px] text-emerald-500 font-mono mt-1">Vendor preset detected: 1CH enrichment fields mapped automatically.</p>
                    )}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {groupedFields.map(([group, fields]) => (
                    <div key={group} className="rounded-xl border border-card-border overflow-hidden">
                      <div className="px-3 py-2 bg-card-bg border-b border-card-border text-[10px] font-bold font-mono text-text-muted uppercase">{group}</div>
                      <div className="divide-y divide-card-border">
                        {fields.map((field) => (
                          <div key={field.key} className="grid grid-cols-[130px_1fr] gap-2 items-center px-3 py-2">
                            <label className="text-[10px] font-semibold text-text-primary">
                              {field.label}
                              {field.required && <span className="text-brand-red ml-0.5">*</span>}
                            </label>
                            <select value={fieldMap[field.key] ?? ''} onChange={(event) => setFieldMap((prev) => ({ ...prev, [field.key]: event.target.value }))} className={inputClass}>
                              <option value="">- skip -</option>
                              {headers.map((header) => (
                                <option key={header} value={header}>{header}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <p className={labelClass}>First {previewRows.length} rows</p>
                  <div className="rounded-xl border border-card-border overflow-x-auto">
                    <table className="w-full text-xs min-w-[720px]">
                      <thead>
                        <tr className="border-b border-card-border bg-card-bg">
                          {FIELD_DEFS.filter((field) => fieldMap[field.key]).slice(0, 10).map((field) => (
                            <th key={field.key} className="text-left px-3 py-2 text-[10px] font-bold font-mono text-text-muted uppercase whitespace-nowrap">{field.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-b border-card-border last:border-0">
                            {FIELD_DEFS.filter((field) => fieldMap[field.key]).slice(0, 10).map((field) => (
                              <td key={field.key} className="px-3 py-2 text-text-secondary truncate max-w-[160px]">{getCellValue(row, field.key) || <span className="text-text-muted italic">-</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {step === 'context' && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Campaign <span className="text-brand-red">*</span></label>
                  <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className={inputClass}>
                    <option value="">- Select a campaign -</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Assign to Rep</label>
                  <select value={assignedToId} onChange={(event) => setAssignedToId(event.target.value)} className={inputClass}>
                    <option value="">Current user</option>
                    {users.filter((user) => user.role === 'sdr' || user.role === 'leadgen').map((user) => (
                      <option key={user.id} value={user.id}>{user.firstName} {user.lastName} ({user.role.replace('_', ' ')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Auto-enroll in Sequence</label>
                  <select value={sequenceId} onChange={(event) => setSequenceId(event.target.value)} className={inputClass}>
                    <option value="">No sequence - create as New</option>
                    {sequences.map((sequence) => (
                      <option key={sequence.id} value={sequence.id}>{sequence.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Email Quality Rule</label>
                  <div className="grid md:grid-cols-3 gap-2">
                    {QUALITY_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => setEmailQualityMode(mode.value)}
                        className={`text-left p-3 rounded-xl border transition-colors ${emailQualityMode === mode.value ? 'bg-brand-red/10 border-brand-red/40 text-text-primary' : 'bg-background border-card-border text-text-secondary hover:text-text-primary'}`}
                      >
                        <span className="block text-xs font-bold">{mode.label}</span>
                        <span className="block text-[10px] text-text-muted mt-1">{mode.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 'review' && summary && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  {[
                    ['Total', summary.total, 'text-text-primary'],
                    ['Importable', summary.toImport, 'text-emerald-500'],
                    ['Duplicates', summary.duplicates.length, 'text-amber-500'],
                    ['Errors', summary.rowsWithErrors, 'text-brand-red'],
                    ['Risky', summary.riskyEmails, 'text-amber-400'],
                    ['Bad Email', summary.undeliverableEmails, 'text-brand-red'],
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-xl border border-card-border bg-background/50 p-3">
                      <p className="text-[10px] font-mono uppercase text-text-muted">{label}</p>
                      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {summary.duplicates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className={labelClass}>Resolve duplicates</p>
                      <div className="flex gap-1 text-[10px]">
                        {(['skip', 'update', 'import'] as Resolution[]).map((resolution) => (
                          <button
                            key={resolution}
                            type="button"
                            onClick={() => {
                              setDefaultResolution(resolution);
                              setRowResolutions({});
                            }}
                            className={`px-2 py-1 rounded-md border font-bold capitalize ${defaultResolution === resolution ? 'bg-brand-red/10 border-brand-red/40 text-brand-red' : 'bg-background border-card-border text-text-muted'}`}
                          >
                            All {resolution}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-card-border overflow-hidden max-h-56 overflow-y-auto divide-y divide-card-border">
                      {summary.duplicates.map((duplicate) => (
                        <div key={duplicate.row} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate">
                              Row {duplicate.row}: {duplicate.incoming.firstName} {duplicate.incoming.lastName}
                              <span className="ml-1.5 text-[9px] font-mono uppercase text-amber-500">{MATCH_LABELS[duplicate.matchType]}</span>
                            </p>
                            <p className="text-text-muted truncate">matches {duplicate.existingSummary}</p>
                          </div>
                          <select value={rowResolutions[String(duplicate.row)] ?? defaultResolution} onChange={(event) => setRowResolutions((prev) => ({ ...prev, [String(duplicate.row)]: event.target.value as Resolution }))} className="bg-background border border-card-border rounded-md px-1.5 py-1 text-[10px] font-semibold text-text-primary focus:outline-none focus:border-brand-red shrink-0">
                            <option value="skip">Skip</option>
                            <option value="update">Update existing</option>
                            <option value="import">Import anyway</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.errorRows.length > 0 && (
                  <button type="button" onClick={downloadErrorRows} className="w-full py-2 border border-brand-red/30 bg-brand-red/5 hover:bg-brand-red/10 rounded-lg text-xs font-semibold text-brand-red transition-colors flex items-center justify-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Download error rows ({summary.errorRows.length})
                  </button>
                )}
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-emerald-600">
                    Ready to queue {summary?.toImport ?? rows.length} new row{(summary?.toImport ?? rows.length) !== 1 ? 's' : ''}.
                    {summary && summary.duplicates.length > 0 && (
                      <span className="text-amber-600"> {summary.duplicates.length} duplicate row{summary.duplicates.length !== 1 ? 's' : ''} will follow your selected resolution.</span>
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-card-border p-3 text-xs text-text-secondary space-y-1">
                  <p><span className="text-text-muted font-mono">Campaign:</span> {campaigns.find((campaign) => campaign.id === campaignId)?.name ?? 'Selected campaign'}</p>
                  <p><span className="text-text-muted font-mono">Assignee:</span> {users.find((user) => user.id === assignedToId)?.firstName ?? 'Current user'}</p>
                  <p><span className="text-text-muted font-mono">Sequence:</span> {sequences.find((sequence) => sequence.id === sequenceId)?.name ?? 'No sequence'}</p>
                  <p><span className="text-text-muted font-mono">Email quality:</span> {emailQualityMode}</p>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-card-border shrink-0 flex gap-2">
            {step === 'upload' && (
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">Cancel</button>
            )}
            {step === 'map' && (
              <>
                <button type="button" onClick={() => setStep('upload')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">Back</button>
                <button type="button" onClick={() => setStep('context')} disabled={!hasMinimumMapping} className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60">Continue</button>
              </>
            )}
            {step === 'context' && (
              <>
                <button type="button" onClick={() => setStep('map')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">Back</button>
                <button type="button" onClick={runDryRun} disabled={dryRunning || !campaignId} className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {dryRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Analyzing...</span></> : 'Run Duplicate Check'}
                </button>
              </>
            )}
            {step === 'review' && (
              <>
                <button type="button" onClick={() => setStep('context')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">Back</button>
                <button type="button" onClick={() => setStep('confirm')} disabled={!summary || (summary.toImport === 0 && !summary.duplicates.some((duplicate) => (rowResolutions[String(duplicate.row)] ?? defaultResolution) !== 'skip'))} className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60">Review Import</button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button type="button" onClick={() => setStep('review')} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">Back</button>
                <button type="button" onClick={confirmImport} disabled={importing || !campaignId} className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {importing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Queueing...</span></> : 'Confirm Import'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
