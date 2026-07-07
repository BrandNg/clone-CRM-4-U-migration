'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, 
  Cpu, 
  Play, 
  RefreshCw, 
  Mail, 
  Layers, 
  CheckCircle2, 
  Activity, 
  AlertCircle 
} from 'lucide-react';
import Link from 'next/link';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  dailySendCount: number;
  dailySendDate: string | null;
  hourlySendWindow: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface ActivityLog {
  id: string;
  type: string;
  description: string | null;
  createdAt: string;
  metadata: any;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
  } | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface StatsMetrics {
  totalActiveSequences: number;
  totalPendingOutbound: number;
  totalActiveAccounts: number;
}

export default function AutomationDashboard() {
  const { isManager } = useAppContext();
  const { showToast } = useToast();

  const [metrics, setMetrics] = useState<StatsMetrics>({
    totalActiveSequences: 0,
    totalPendingOutbound: 0,
    totalActiveAccounts: 0,
  });
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTriggeringSequence, setIsTriggeringSequence] = useState<boolean>(false);
  const [isTriggeringInbox, setIsTriggeringInbox] = useState<boolean>(false);

  const [sequenceResult, setSequenceResult] = useState<any | null>(null);
  const [inboxResult, setInboxResult] = useState<any | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/stats');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setEmailAccounts(data.emailAccounts);
        setActivities(data.activities);
      } else {
        showToast('Failed to load automation stats', 'error');
      }
    } catch {
      showToast('Network error loading automation stats', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isManager) {
      fetchStats();
    }
  }, [isManager, fetchStats]);

  const handleTriggerSequence = async () => {
    setIsTriggeringSequence(true);
    setSequenceResult(null);
    try {
      const res = await fetch('/api/cron/sequence-engine');
      const data = await res.json();
      if (res.ok) {
        setSequenceResult(data);
        showToast('Sequence Engine execution completed successfully!', 'success');
        fetchStats();
      } else {
        setSequenceResult({ error: data.error || 'Failed to execute Sequence Engine' });
        showToast('Sequence Engine execution failed', 'error');
      }
    } catch {
      setSequenceResult({ error: 'Network error triggering sequence engine' });
      showToast('Sequence Engine trigger failed', 'error');
    } finally {
      setIsTriggeringSequence(false);
    }
  };

  const handleTriggerInbox = async () => {
    setIsTriggeringInbox(true);
    setInboxResult(null);
    try {
      const res = await fetch('/api/cron/inbox-sync');
      const data = await res.json();
      if (res.ok) {
        setInboxResult(data);
        showToast('Inbox synchronization completed successfully!', 'success');
        fetchStats();
      } else {
        setInboxResult({ error: data.error || 'Failed to sync inboxes' });
        showToast('Inbox Sync failed', 'error');
      }
    } catch {
      setInboxResult({ error: 'Network error synchronizing inboxes' });
      showToast('Inbox Sync trigger failed', 'error');
    } finally {
      setIsTriggeringInbox(false);
    }
  };

  const formatActivityType = (type: string) => {
    switch (type) {
      case 'email_sent':
        return { label: 'Outbound Email', color: 'bg-blue-500/10 text-blue-400 border-blue-500/25' };
      case 'sequence_enrolled':
        return { label: 'Enrolled', color: 'bg-purple-500/10 text-purple-400 border-purple-500/25' };
      case 'sequence_completed':
        return { label: 'Completed', color: 'bg-green-500/10 text-green-400 border-green-500/25' };
      case 'sequence_unenrolled':
        return { label: 'Paused/Stopped', color: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
      case 'stage_changed':
        return { label: 'Stage Switch', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25' };
      default:
        return { label: type, color: 'bg-gray-500/10 text-gray-400 border-gray-500/25' };
    }
  };

  if (!isManager) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto my-12 animate-in fade-in duration-300">
        <div className="w-16 h-16 bg-brand-red/10 border border-brand-red/25 rounded-2xl flex items-center justify-center text-brand-red">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="font-display font-extrabold text-lg text-text-primary">Manager Access Only</h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          The AI Automation Dashboard is restricted to Directors, Floor Managers, and Team Leads.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full animate-spin" />
        <p className="text-sm text-text-secondary font-medium font-display">Loading automation systems state...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex-1 flex flex-col animate-in fade-in duration-200">
      {/* Page Hero Header */}
      <div className="page-hero flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            AI Automation Control Center
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Monitor outbound sequence task triggers, mail counts, and manual synchronization crons.
          </p>
        </div>
        <button 
          onClick={() => { setIsLoading(true); fetchStats(); }}
          className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-dark-alt hover:bg-brand-dark border border-card-border text-text-primary hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-3 gap-5 stagger-container">
        {/* Metric 1 */}
        <div className="glass-card rounded-2xl p-5 hover-lift relative overflow-hidden flex items-center gap-4 stagger-child">
          <div className="w-12 h-12 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-text-secondary block font-semibold uppercase tracking-wider font-display">Active Sequence Enrolls</span>
            <span className="text-2xl font-extrabold text-text-primary font-display mt-0.5 block">{metrics.totalActiveSequences}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="glass-card rounded-2xl p-5 hover-lift relative overflow-hidden flex items-center gap-4 stagger-child">
          <div className="w-12 h-12 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl flex items-center justify-center">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-text-secondary block font-semibold uppercase tracking-wider font-display">Outbound Email Queue</span>
            <span className="text-2xl font-extrabold text-text-primary font-display mt-0.5 block">{metrics.totalPendingOutbound}</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="glass-card rounded-2xl p-5 hover-lift relative overflow-hidden flex items-center gap-4 stagger-child">
          <div className="w-12 h-12 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl flex items-center justify-center">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-text-secondary block font-semibold uppercase tracking-wider font-display">Connected Mailboxes</span>
            <span className="text-2xl font-extrabold text-text-primary font-display mt-0.5 block">{metrics.totalActiveAccounts}</span>
          </div>
        </div>
      </div>

      {/* Main Execution Board & Account Limit Table */}
      <div className="grid grid-cols-12 gap-6 items-start">
        
        {/* Left Hand: Manual Actions / Triggers */}
        <div className="col-span-5 space-y-6">
          
          {/* Action Card: Sequence Engine */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
                  <Cpu className="w-4.5 h-4.5 text-brand-orange" />
                  Sequence Automation Engine
                </h3>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Processes and automatically sends outgoing sequence emails. Distributes scheduling hourly windows.
                </p>
              </div>
            </div>
            
            <button
              onClick={handleTriggerSequence}
              disabled={isTriggeringSequence}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                isTriggeringSequence 
                  ? 'bg-brand-dark border border-card-border text-text-muted cursor-not-allowed'
                  : 'bg-brand-red hover:bg-brand-red-hover text-white shadow-brand-red/10'
              }`}
            >
              {isTriggeringSequence ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing Sends...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Run Sequence Engine
                </>
              )}
            </button>

            {sequenceResult && (
              <div className={`p-4 rounded-xl text-xs border ${
                sequenceResult.error 
                  ? 'bg-red-500/5 border-red-500/25 text-red-400' 
                  : 'bg-green-500/5 border-green-500/25 text-green-400'
              }`}>
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  {sequenceResult.error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {sequenceResult.error ? 'Execution Failed' : 'Execution Complete'}
                </div>
                {sequenceResult.error ? (
                  <p className="font-mono text-[10px] text-red-300">{sequenceResult.error}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10px]">
                    <div>Processed Tasks: <span className="font-semibold text-text-primary">{sequenceResult.processed}</span></div>
                    <div>Sent Emails: <span className="font-semibold text-text-primary">{sequenceResult.sent}</span></div>
                    <div>Skipped Tasks: <span className="font-semibold text-text-primary">{sequenceResult.skipped}</span></div>
                    <div>Errors Count: <span className="font-semibold text-text-primary">{sequenceResult.errors}</span></div>
                    <div className="col-span-2">Daily Alerts Created: <span className="font-semibold text-text-primary">{sequenceResult.notified}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Card: Inbox Synchronization */}
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
                  <RefreshCw className="w-4.5 h-4.5 text-brand-gold" />
                  Inbox Sync Engine
                </h3>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Fetches recent inbox replies. Flags email bounces (NDR) and auto-unenrolls leads who have replied.
                </p>
              </div>
            </div>

            <button
              onClick={handleTriggerInbox}
              disabled={isTriggeringInbox}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                isTriggeringInbox 
                  ? 'bg-brand-dark border border-card-border text-text-muted cursor-not-allowed'
                  : 'bg-brand-orange hover:bg-brand-orange-hover text-white shadow-brand-orange/10'
              }`}
            >
              {isTriggeringInbox ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing Inboxes...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Run Inbox Sync
                </>
              )}
            </button>

            {inboxResult && (
              <div className={`p-4 rounded-xl text-xs border ${
                inboxResult.error 
                  ? 'bg-red-500/5 border-red-500/25 text-red-400' 
                  : 'bg-green-500/5 border-green-500/25 text-green-400'
              }`}>
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  {inboxResult.error ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {inboxResult.error ? 'Sync Failed' : 'Sync Complete'}
                </div>
                {inboxResult.error ? (
                  <p className="font-mono text-[10px] text-red-300">{inboxResult.error}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-[10px]">
                    <div>Active Mailboxes: <span className="font-semibold text-text-primary">{inboxResult.accounts}</span></div>
                    <div>Replies Detected: <span className="font-semibold text-text-primary">{inboxResult.replies}</span></div>
                    <div>Bounces Detected: <span className="font-semibold text-text-primary">{inboxResult.bounces}</span></div>
                    <div>Failed Syncs: <span className="font-semibold text-text-primary">{inboxResult.failedAccounts}</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Hand: Active Connected Email Accounts */}
        <div className="col-span-7 glass-card rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="font-display font-extrabold text-sm text-text-primary">
              Active Outbound Accounts & Daily Limits
            </h3>
            <p className="text-[11px] text-text-secondary">
              Review remaining send capacity per connected SDR email address. Cap is 80 daily sends.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-card-border text-[10px] uppercase text-text-secondary tracking-wider font-semibold">
                  <th className="py-2.5">Owner / SDR</th>
                  <th className="py-2.5">Email / Provider</th>
                  <th className="py-2.5 text-center">Daily Cap (80)</th>
                  <th className="py-2.5">Last Sync</th>
                  <th className="py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {emailAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-text-muted">
                      No active connected email accounts found.
                    </td>
                  </tr>
                ) : (
                  emailAccounts.map((account) => {
                    const capPercentage = Math.min(100, Math.round((account.dailySendCount / 80) * 100));
                    
                    return (
                      <tr key={account.id} className="hover:bg-card-bg/20 transition-colors">
                        <td className="py-3 font-semibold text-text-primary">
                          {account.user.firstName} {account.user.lastName}
                        </td>
                        <td className="py-3">
                          <div className="font-medium text-text-primary truncate max-w-[150px]">{account.email}</div>
                          <div className="text-[9px] font-mono text-text-secondary uppercase">{account.provider}</div>
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex flex-col items-center gap-1 min-w-[80px]">
                            <span className="font-mono font-semibold">{account.dailySendCount} / 80</span>
                            <div className="w-full bg-card-border/50 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  capPercentage >= 90 
                                    ? 'bg-red-500' 
                                    : capPercentage >= 70 
                                      ? 'bg-brand-orange' 
                                      : 'bg-blue-500'
                                }`} 
                                style={{ width: `${capPercentage}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 font-mono text-[10px] text-text-secondary">
                          {account.lastSyncAt 
                            ? new Date(account.lastSyncAt).toLocaleString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })
                            : 'Never'}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide border ${
                            account.isActive 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {account.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Live System Activity Feed */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <Activity className="w-4.5 h-4.5 text-brand-red animate-pulse" />
            Live Automation Activity Feed
          </h3>
          <p className="text-[11px] text-text-secondary">
            Real-time synchronization logs showing active outreach transitions and auto-replies.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-card-border text-[10px] uppercase text-text-secondary tracking-wider font-semibold">
                <th className="py-2.5">Event Type</th>
                <th className="py-2.5">Lead</th>
                <th className="py-2.5">SDR Owner</th>
                <th className="py-2.5">Action Details</th>
                <th className="py-2.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/50">
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted">
                    No recent automation activities found.
                  </td>
                </tr>
              ) : (
                activities.map((act) => {
                  const labelStyle = formatActivityType(act.type);
                  
                  return (
                    <tr key={act.id} className="hover:bg-card-bg/20 transition-colors">
                      <td className="py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold border ${labelStyle.color}`}>
                          {labelStyle.label}
                        </span>
                      </td>
                      <td className="py-3">
                        {act.lead ? (
                          <Link 
                            href={`/leads/${act.lead.id}`}
                            className="font-semibold text-brand-orange hover:underline block"
                          >
                            {act.lead.firstName} {act.lead.lastName}
                            <span className="font-normal text-[10px] text-text-secondary block">{act.lead.company}</span>
                          </Link>
                        ) : (
                          <span className="text-text-muted font-mono text-[10px]">None</span>
                        )}
                      </td>
                      <td className="py-3 font-medium text-text-primary">
                        {act.user.firstName} {act.user.lastName}
                      </td>
                      <td className="py-3 text-text-secondary max-w-[280px] break-words">
                        {act.description || 'No description provided'}
                      </td>
                      <td className="py-3 font-mono text-[10px] text-text-secondary">
                        {new Date(act.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
