'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Zap } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface QueueCount {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

interface QueueStat {
  name: string;
  counts: QueueCount | null;
  error?: string;
}

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
  enqueuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface HealthData {
  redis: string;
  database: string;
  queues: QueueStat[];
  latestHealthcheck: JobRun | null;
}

export default function WorkerHealthAdminPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);

  const fetchHealth = useCallback(async (showNotification = false) => {
    try {
      const res = await fetch('/api/admin/worker-health');
      if (res.ok) {
        const body = await res.json();
        setData(body);
        if (showNotification) {
          showToast('Health data updated', 'success');
        }
      } else {
        showToast('Failed to fetch worker health metrics', 'error');
      }
    } catch {
      showToast('Network error loading health metrics', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Poll for health check updates if a check was recently enqueued
  useEffect(() => {
    if (pollingCount <= 0) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/worker-health');
        if (res.ok) {
          const body = await res.json();
          setData(body);
          
          const latest = body.latestHealthcheck as JobRun | null;
          if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
            showToast(`Health check job ${latest.status}!`, latest.status === 'completed' ? 'success' : 'error');
            setPollingCount(0);
            return;
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }

      setPollingCount((prev) => prev - 1);
    }, 1500);

    return () => clearInterval(interval);
  }, [pollingCount, showToast]);

  const handleRunHealthCheck = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/admin/worker-health', {
        method: 'POST',
      });
      if (res.ok) {
        showToast('Healthcheck job enqueued in background', 'success');
        setPollingCount(8); // Poll 8 times (12 seconds)
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Failed to trigger health check', 'error');
      }
    } catch {
      showToast('Network error triggering health check', 'error');
    } finally {
      setTriggering(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'ok') {
      return (
        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 self-center">
          <CheckCircle className="w-3.5 h-3.5" /> Connected
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-brand-red/10 text-brand-red border border-brand-red/20 flex items-center gap-1.5 self-center">
        <AlertCircle className="w-3.5 h-3.5" /> Disconnected
      </span>
    );
  };

  const getJobStatusBadge = (status: string) => {
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

  return (
    <div className="space-y-6 flex-1 flex flex-col min-h-0">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <button
          onClick={handleRunHealthCheck}
          disabled={triggering || pollingCount > 0}
          className="flex items-center gap-2 px-4 py-2 bg-brand-red hover:bg-brand-orange text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-brand-red/10 disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          <span>{pollingCount > 0 ? 'Testing Worker...' : 'Run Diagnostics Now'}</span>
        </button>

        <button
          onClick={() => fetchHealth(true)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-border/40 border border-card-border text-text-secondary hover:text-text-primary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && !data ? (
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-text-muted text-xs font-mono animate-pulse">Running health check diagnostics...</div>
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center p-12 text-center">
          <p className="text-xs text-text-muted">Failed to retrieve diagnostics.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 flex-1 min-h-0 overflow-auto">
          {/* Left panel: connection status */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Infrastructure status</h3>
            
            <div className="glass-card rounded-2xl p-4 flex justify-between items-center border border-card-border">
              <div>
                <span className="text-sm font-semibold text-text-primary block">Database</span>
                <span className="text-[10px] text-text-muted font-mono block">Neon HTTP driver</span>
              </div>
              {getStatusBadge(data.database)}
            </div>

            <div className="glass-card rounded-2xl p-4 flex justify-between items-center border border-card-border">
              <div>
                <span className="text-sm font-semibold text-text-primary block">Redis Cache</span>
                <span className="text-[10px] text-text-muted font-mono block">BullMQ connection</span>
              </div>
              {getStatusBadge(data.redis)}
            </div>

            {/* Latest health check report card */}
            {data.latestHealthcheck && (
              <div className="glass-card rounded-2xl p-4 space-y-4 border border-card-border bg-background/25">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Last Healthcheck Run</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getJobStatusBadge(data.latestHealthcheck.status)}`}>
                    {data.latestHealthcheck.status}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-text-muted block text-[10px] uppercase font-mono">Run Date</span>
                    <span className="text-text-primary font-medium">{new Date(data.latestHealthcheck.enqueuedAt).toLocaleString()}</span>
                  </div>

                  {data.latestHealthcheck.result && (
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Worker Outcomes</span>
                      <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] text-text-secondary mt-1 max-h-24 overflow-auto">
                        {JSON.stringify(data.latestHealthcheck.result, null, 2)}
                      </pre>
                    </div>
                  )}

                  {data.latestHealthcheck.status === 'failed' && data.latestHealthcheck.failedReason && (
                    <div className="bg-brand-red/[0.03] border border-brand-red/20 rounded-xl p-3">
                      <p className="font-mono text-[10px] text-brand-red break-words whitespace-pre-wrap">
                        {data.latestHealthcheck.failedReason}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right panel: queues list */}
          <div className="col-span-2 space-y-4 flex flex-col min-h-0">
            <h3 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">BullMQ Queue status</h3>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {data.queues.map((q) => (
                <div key={q.name} className="glass-card rounded-2xl p-4 border border-card-border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-text-primary capitalize">{q.name} Queue</span>
                    {q.error ? (
                      <span className="text-[10px] font-mono text-brand-red bg-brand-red/10 border border-brand-red/20 px-2 py-0.5 rounded">
                        {q.error}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>

                  {q.counts ? (
                    <div className="grid grid-cols-6 gap-2">
                      {[
                        { label: 'Waiting', val: q.counts.waiting, color: 'text-text-primary' },
                        { label: 'Active', val: q.counts.active, color: 'text-blue-400 font-bold' },
                        { label: 'Delayed', val: q.counts.delayed, color: 'text-brand-orange' },
                        { label: 'Paused', val: q.counts.paused, color: 'text-text-muted' },
                        { label: 'Completed', val: q.counts.completed, color: 'text-emerald-400' },
                        { label: 'Failed', val: q.counts.failed, color: q.counts.failed > 0 ? 'text-brand-red font-bold' : 'text-text-muted' },
                      ].map((item) => (
                        <div key={item.label} className="bg-background/40 border border-card-border/60 rounded-xl p-2.5 text-center">
                          <span className="text-[9px] font-mono text-text-muted uppercase block">{item.label}</span>
                          <span className={`text-sm font-extrabold font-mono mt-0.5 block ${item.color}`}>
                            {item.val}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted italic">No stats available for this queue.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
