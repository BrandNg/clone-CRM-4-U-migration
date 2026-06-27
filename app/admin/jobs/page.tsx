'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Database, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface JobRun {
  id: string;
  queueName: string;
  jobName: string;
  bullJobId: string | null;
  dedupeKey: string;
  status: string;
  progress: any;
  result: any;
  failedReason: string | null;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export default function JobsAdminPage() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [queueFilter, setQueueFilter] = useState('all');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/admin/jobs';
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (queueFilter !== 'all') params.append('queueName', queueFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      } else {
        showToast('Failed to fetch job runs', 'error');
      }
    } catch {
      showToast('Network error while loading jobs', 'error');
    } finally {
      setLoading(false);
    }
  }, [queueFilter, showToast, statusFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed':
        return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      case 'queued':
      default:
        return 'bg-gray-500/10 text-text-muted border-card-border';
    }
  };

  const getDuration = (job: JobRun) => {
    if (!job.startedAt || !job.completedAt) return '—';
    const elapsed = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
    if (elapsed < 1000) return `${elapsed}ms`;
    return `${(elapsed / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex gap-2">
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-card-bg border border-card-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
            >
              <option value="all">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value)}
              className="bg-card-bg border border-card-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
            >
              <option value="all">All Queues</option>
              <option value="sequence">Sequence Queue</option>
              <option value="email">Email Queue</option>
              <option value="import">Import Queue</option>
              <option value="sync">Sync Queue</option>
              <option value="maintenance">Maintenance Queue</option>
            </select>
          </div>
        </div>

        <button
          onClick={fetchJobs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-border/40 border border-card-border text-text-secondary hover:text-text-primary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading && jobs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-text-muted text-xs font-mono animate-pulse">Loading job execution logs...</div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-2">
            <Database className="w-8 h-8 text-text-muted" />
            <p className="text-xs text-text-muted">No background job runs found.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-card-border bg-background/25 sticky top-0 backdrop-blur-md">
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Job Info</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Queue</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Status</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Attempts</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Duration</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Enqueued At</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {jobs.map((job) => {
                  const isExpanded = expandedJobId === job.id;
                  return (
                    <Fragment key={job.id}>
                      <tr
                        className={`hover:bg-background/40 transition-colors ${
                          isExpanded ? 'bg-background/20' : ''
                        }`}
                      >
                        <td className="p-4">
                          <div>
                            <span className="font-semibold text-text-primary block">{job.jobName}</span>
                            <span className="text-[10px] text-text-muted font-mono block">ID: {job.id}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded bg-card-border font-mono text-[10px] text-text-secondary uppercase">
                            {job.queueName}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-mono text-text-secondary">
                            {job.attempts} / {job.maxAttempts}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="flex items-center gap-1 font-mono text-text-secondary">
                            <Clock className="w-3 h-3 text-text-muted" />
                            {getDuration(job)}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-text-muted font-mono">
                            {new Date(job.enqueuedAt).toLocaleString()}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                            className="text-[10px] font-semibold text-brand-orange hover:underline font-mono"
                          >
                            {isExpanded ? 'Hide Details' : 'View Details'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-background/10 border-b border-card-border">
                          <td colSpan={7} className="p-4">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div className="space-y-2">
                                <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider">Deduplication Key</p>
                                <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] overflow-x-auto text-text-secondary break-all">
                                  {job.dedupeKey}
                                </pre>

                                {job.bullJobId && (
                                  <>
                                    <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mt-3">BullMQ Job ID</p>
                                    <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] text-text-secondary">
                                      {job.bullJobId}
                                    </pre>
                                  </>
                                )}
                              </div>

                              <div className="space-y-2">
                                {job.status === 'failed' && job.failedReason && (
                                  <div className="bg-brand-red/[0.03] border border-brand-red/20 rounded-xl p-3 space-y-1">
                                    <h4 className="text-[10px] font-bold font-mono text-brand-red uppercase tracking-wider flex items-center gap-1">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      Failed Reason
                                    </h4>
                                    <p className="font-mono text-[10px] text-brand-red leading-relaxed break-words whitespace-pre-wrap">
                                      {job.failedReason}
                                    </p>
                                  </div>
                                )}

                                {job.progress && (
                                  <div>
                                    <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Execution Progress</p>
                                    <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] overflow-x-auto text-text-secondary">
                                      {JSON.stringify(job.progress, null, 2)}
                                    </pre>
                                  </div>
                                )}

                                {job.result && (
                                  <div>
                                    <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Job Result</p>
                                    <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] overflow-x-auto text-text-secondary">
                                      {JSON.stringify(job.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
