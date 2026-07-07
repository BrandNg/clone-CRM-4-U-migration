'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, ChevronRight, X, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/context/ToastContext';

interface ImportBatch {
  id: string;
  campaignId: string;
  campaign: {
    id: string;
    name: string;
  };
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  filename: string | null;
  totalRows: number;
  parsedRows: number;
  errorRows: number;
  status: string;
  createdAt: string;
}

interface ImportRow {
  id: string;
  rowIndex: number;
  data: any;
  errors: any;
  status: string;
  leadId: string | null;
}

interface BatchDetail extends ImportBatch {
  importRows: ImportRow[];
}

export default function ImportsAdminPage() {
  const { showToast } = useToast();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/imports');
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      } else {
        showToast('Failed to fetch import batches', 'error');
      }
    } catch {
      showToast('Network error loading imports', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchBatchDetail = async (id: string) => {
    setDetailLoading(true);
    setSelectedBatchId(id);
    setBatchDetail(null);
    try {
      const res = await fetch(`/api/admin/imports/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBatchDetail(data);
      } else {
        showToast('Failed to fetch batch details', 'error');
      }
    } catch {
      showToast('Network error loading details', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'committed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'committing':
      case 'parsed':
      case 'parsing':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'failed':
        return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      case 'pending':
      default:
        return 'bg-gray-500/10 text-text-muted border-card-border';
    }
  };

  const downloadErrorRows = () => {
    if (!batchDetail) return;
    const rows = batchDetail.importRows.filter((row) => row.status === 'error');
    const csv = [
      'row,status,reason',
      ...rows.map((row) => {
        const reason = ((row.errors as any)?.reason || JSON.stringify(row.errors || {})).replace(/"/g, '""');
        return `${row.rowIndex},${row.status},"${reason}"`;
      }),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${batchDetail.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0 relative">
      {/* Top action */}
      <div className="flex justify-end shrink-0">
        <button
          onClick={fetchBatches}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-border/40 border border-card-border text-text-secondary hover:text-text-primary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Batches Table */}
      <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading && batches.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-text-muted text-xs font-mono animate-pulse">Loading import history...</div>
          </div>
        ) : batches.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-2">
            <Upload className="w-8 h-8 text-text-muted" />
            <p className="text-xs text-text-muted">No lead imports found.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-card-border bg-background/25 sticky top-0 backdrop-blur-md">
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Filename</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Target Campaign</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Uploaded By</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Rows (Total / Success / Error)</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Status</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Date</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-background/40 transition-colors">
                    <td className="p-4 font-semibold text-text-primary">
                      {batch.filename || 'import.csv'}
                    </td>
                    <td className="p-4">
                      <span className="text-text-secondary">{batch.campaign?.name}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-text-secondary">
                        {batch.user?.firstName} {batch.user?.lastName}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-text-secondary">
                      {batch.totalRows} total · <span className="text-emerald-400">{batch.parsedRows} ok</span> · <span className="text-brand-red">{batch.errorRows} err</span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getStatusColor(batch.status)}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="p-4 text-text-muted font-mono">
                      {new Date(batch.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => fetchBatchDetail(batch.id)}
                        className="text-[10px] font-semibold text-brand-orange hover:underline font-mono flex items-center gap-0.5 ml-auto"
                      >
                        Inspect <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over details view */}
      {selectedBatchId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBatchId(null)} />
          <div className="relative w-full max-w-lg h-full bg-card-bg border-l border-card-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/50">
              <div>
                <h2 className="font-display font-bold text-sm text-text-primary">
                  Inspect Import Batch
                </h2>
                <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                  Batch ID: {selectedBatchId}
                </p>
              </div>
              <button
                onClick={() => setSelectedBatchId(null)}
                className="p-1.5 hover:bg-card-border/40 text-text-muted hover:text-text-primary rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {detailLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-text-muted text-xs font-mono animate-pulse">Loading batch details...</div>
                </div>
              ) : batchDetail ? (
                <div className="space-y-4">
                  {/* Summary metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-background/60 border border-card-border rounded-xl p-3 text-center">
                      <span className="text-[10px] font-mono text-text-muted uppercase block">Total Rows</span>
                      <span className="text-base font-extrabold text-text-primary font-mono mt-0.5 block">{batchDetail.totalRows}</span>
                    </div>
                    <div className="bg-background/60 border border-card-border rounded-xl p-3 text-center">
                      <span className="text-[10px] font-mono text-text-muted uppercase block">Imported</span>
                      <span className="text-base font-extrabold text-emerald-400 font-mono mt-0.5 block">{batchDetail.parsedRows}</span>
                    </div>
                    <div className="bg-background/60 border border-card-border rounded-xl p-3 text-center">
                      <span className="text-[10px] font-mono text-text-muted uppercase block">Skipped/Errors</span>
                      <span className="text-base font-extrabold text-brand-red font-mono mt-0.5 block">{batchDetail.errorRows}</span>
                    </div>
                  </div>

                  {/* Rows List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Row Validation Log</p>
                      {batchDetail.importRows.some((row) => row.status === 'error') && (
                        <button
                          type="button"
                          onClick={downloadErrorRows}
                          className="text-[10px] font-semibold text-brand-red hover:underline font-mono"
                        >
                          Download Errors
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                      {batchDetail.importRows.length === 0 ? (
                        <p className="text-xs text-text-muted italic">No rows recorded in database logs.</p>
                      ) : (
                        batchDetail.importRows.map((row) => (
                          <div
                            key={row.id}
                            className={`rounded-xl border p-3 flex items-start justify-between gap-3 text-xs ${
                              row.status === 'imported' || row.status === 'updated'
                                ? 'bg-emerald-500/[0.02] border-emerald-500/10'
                                : 'bg-brand-red/[0.02] border-brand-red/10'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-text-primary truncate">
                                Row {row.rowIndex}: {row.data?.firstName} {row.data?.lastName}
                              </p>
                              <p className="text-[10px] text-text-muted truncate mt-0.5">
                                {row.data?.email || 'No email'} · {row.data?.company || 'No company'}
                              </p>

                              {row.leadId && (
                                <Link
                                  href={`/leads/${row.leadId}`}
                                  className="text-[10px] font-mono text-brand-orange hover:underline mt-1 inline-block"
                                >
                                  Open lead
                                </Link>
                              )}

                              {row.errors && (
                                <p className="text-[10px] font-mono text-brand-red mt-1.5 leading-relaxed bg-brand-red/[0.04] rounded-lg p-2 border border-brand-red/10 flex items-start gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>{(row.errors as any).reason || JSON.stringify(row.errors)}</span>
                                </p>
                              )}
                            </div>
                            <div>
                              {row.status === 'imported' || row.status === 'updated' ? (
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold border border-emerald-500/20 rounded font-mono flex items-center gap-0.5 whitespace-nowrap">
                                  <CheckCircle className="w-3 h-3" /> {row.status.toUpperCase()}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-brand-red/10 text-brand-red text-[9px] font-bold border border-brand-red/20 rounded font-mono flex items-center gap-0.5 whitespace-nowrap">
                                  <AlertCircle className="w-3 h-3" /> ERROR / SKIP
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-text-muted font-mono">No details available.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
