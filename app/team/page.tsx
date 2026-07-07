'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { canImportExport } from '@/lib/permissions';
import dynamic from 'next/dynamic';

// Modular subcomponents
import CampaignOverview from '@/components/team/CampaignOverview';
import TeamLeaderboard from '@/components/team/TeamLeaderboard';
import OverdueAlerts from '@/components/team/OverdueAlerts';
import RepProgressTracker from '@/components/team/RepProgressTracker';
import MeetingsBoard from '@/components/team/MeetingsBoard';
import SequencePerformanceReport from '@/components/SequencePerformanceReport';
import type { ScopedSequenceStats } from '@/lib/sequences/analytics';

// Loaded on demand: the slide-over and the recharts-heavy campaign drill-down
// (~50KB) only render on interaction, so their chunks stay out of the initial bundle.
const LeadDetailPanel = dynamic(() => import('@/components/LeadDetailPanel'), { ssr: false });
const CampaignDetail = dynamic(() => import('@/components/team/CampaignDetail'), { ssr: false });

interface User {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  managerId: string | null;
}

export default function TeamViewPage() {
  const { currentRole, isManager, isSessionLoading } = useAppContext();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!isSessionLoading && !isManager) {
      router.replace('/');
    }
  }, [isSessionLoading, isManager, router]);

  // Navigation states
  const [activeTab, setActiveTab] = useState<'campaigns' | 'performance' | 'progress' | 'meetings' | 'sequences'>('campaigns');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // Filter states
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('week');
  const [filterSdr, setFilterSdr] = useState<string>('');
  const [filterManager, setFilterManager] = useState<string>('');

  // Loaded data states
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<any | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<{ users: any[]; atRiskLeads: any[] } | null>(null);
  const [seqStats, setSeqStats] = useState<ScopedSequenceStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load user filters dropdown
  useEffect(() => {
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch campaign overview
  const fetchCampaignsOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/team/campaigns?dateRange=${dateRange}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch {
      showToast('Failed to load campaigns list', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, showToast]);

  // Fetch single campaign details
  const fetchCampaignDetails = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/team/campaigns/${id}?dateRange=${dateRange}`);
      if (res.ok) {
        const data = await res.json();
        setCampaignDetail(data);
      } else {
        setCampaignDetail(null);
      }
    } catch {
      showToast('Failed to load campaign details', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, showToast]);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ dateRange });
      if (filterSdr) params.set('sdrId', filterSdr);
      if (filterManager) params.set('managerId', filterManager);

      const res = await fetch(`/api/team/leaderboard?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch {
      showToast('Failed to load activity rankings', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, filterSdr, filterManager, showToast]);

  // Fetch alerts monitor data
  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterSdr) params.set('sdrId', filterSdr);
      if (filterManager) params.set('managerId', filterManager);

      const res = await fetch(`/api/team/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
      }
    } catch {
      showToast('Failed to retrieve overdue alerts', 'error');
    }
  }, [filterSdr, filterManager, showToast]);

  // Fetch role-scoped sequence performance (Director=all, FM/TL=pod∪accounts).
  const fetchSeqStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sequences/team-analytics');
      if (res.ok) setSeqStats(await res.json());
    } catch {
      showToast('Failed to load sequence performance', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // Master fetch effect depending on navigation path
  useEffect(() => {
    // SDRs bypass overview and land directly on their assigned campaign detail
    if (currentRole === 'sdr') {
      setActiveTab('campaigns');
      fetchCampaignsOverview();
      return;
    }

    if (activeTab === 'campaigns') {
      if (selectedCampaignId) {
        fetchCampaignDetails(selectedCampaignId);
      } else {
        fetchCampaignsOverview();
      }
    } else if (activeTab === 'performance') {
      fetchLeaderboard();
      fetchAlerts();
    } else if (activeTab === 'sequences') {
      fetchSeqStats();
    } else {
      setIsLoading(false);
    }
  }, [currentRole, activeTab, selectedCampaignId, fetchCampaignsOverview, fetchCampaignDetails, fetchLeaderboard, fetchAlerts, fetchSeqStats]);

  // When SDR campaigns are loaded, auto-select the first one (their assigned campaign or fallback)
  useEffect(() => {
    if (currentRole === 'sdr' && campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [currentRole, campaigns, selectedCampaignId]);

  // CSV export handler
  const handleExportCSV = (detail: any) => {
    if (!detail) return;
    try {
      const totalCalls = detail.reps.reduce((s: number, r: any) => s + r.calls, 0);
      const totalEmails = detail.reps.reduce((s: number, r: any) => s + r.emails, 0);
      const totalLinkedIn = detail.reps.reduce((s: number, r: any) => s + r.linkedin, 0);
      const totalWhatsApp = detail.reps.reduce((s: number, r: any) => s + r.whatsapp, 0);

      const rows: string[][] = [
        ['Telestar SDR — Client Outbound Report'],
        ['Campaign', detail.campaignName],
        ['Client', detail.clientName],
        ['Generated', new Date().toLocaleString()],
        [],
        ['PIPELINE FUNNEL COUNT'],
        ['Stage', 'Lead Count'],
        ['New', String(detail.stageCounts.new ?? 0)],
        ['Sequence Active', String(detail.stageCounts.sequence_active ?? 0)],
        ['Replied', String(detail.stageCounts.replied ?? 0)],
        ['Meeting Booked', String(detail.stageCounts.meeting_booked ?? 0)],
        ['Won', String(detail.stageCounts.won ?? 0)],
        ['Lost', String(detail.stageCounts.lost ?? 0)],
        [],
        ['TOTAL OUTREACH VOLUMES'],
        ['Channel', 'Actions count'],
        ['Calls', String(totalCalls)],
        ['Emails', String(totalEmails)],
        ['LinkedIn', String(totalLinkedIn)],
        ['WhatsApp', String(totalWhatsApp)],
        [],
        ['MEETINGS BOOKED', String(detail.kpis.meetingsBooked)],
      ];

      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telestar-${detail.campaignName.replace(/\s+/g, '-')}-report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('CSV report downloaded.', 'success');
    } catch {
      showToast('Failed to export CSV', 'error');
    }
  };

  // HTML sanitization for PDF export
  const escHtml = (s: string | number) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // PDF print handler
  const handleExportPDF = (detail: any) => {
    if (!detail) return;
    const generatedAt = new Date().toLocaleString();
    const totalLeads = (Object.values(detail.stageCounts || {}).reduce((sum: number, val: any) => sum + Number(val), 0) || 1) as number;

    const totalCalls = detail.reps.reduce((s: number, r: any) => s + r.calls, 0);
    const totalEmails = detail.reps.reduce((s: number, r: any) => s + r.emails, 0);
    const totalLinkedIn = detail.reps.reduce((s: number, r: any) => s + r.linkedin, 0);
    const totalWhatsApp = detail.reps.reduce((s: number, r: any) => s + r.whatsapp, 0);

    const pipelineRows = [
      ['New', detail.stageCounts.new ?? 0],
      ['Sequence Active', detail.stageCounts.sequence_active ?? 0],
      ['Replied', detail.stageCounts.replied ?? 0],
      ['Meeting Booked', detail.stageCounts.meeting_booked ?? 0],
      ['Won', detail.stageCounts.won ?? 0],
      ['Lost', detail.stageCounts.lost ?? 0],
    ].filter(([, v]) => (v as number) > 0);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Telestar Campaign Report — ${escHtml(detail.campaignName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #111; background: #fff; padding: 32px 40px; }
  h1 { font-size: 20px; font-weight: 800; color: #D42B1E; margin-bottom: 2px; }
  .sub { font-size: 11px; color: #666; margin-bottom: 24px; }
  h2 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #333; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 20px 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 1px solid #e5e7eb; }
  td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; }
  tr:last-child td { border-bottom: none; }
  .highlight td:first-child { font-weight: 700; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #999; }
  @media print { body { padding: 16px 20px; } }
</style>
</head>
<body>
<h1>TeleStar SDR — Campaign Report</h1>
<p class="sub">Client: <strong>${escHtml(detail.clientName)}</strong> &nbsp;·&nbsp; Campaign: <strong>${escHtml(detail.campaignName)}</strong> &nbsp;·&nbsp; Generated: ${generatedAt}</p>

<h2>Pipeline Overview</h2>
<table>
  <thead><tr><th>Stage</th><th>Leads</th><th>% of Total</th></tr></thead>
  <tbody>
    ${pipelineRows.map(([stage, count]) => `
      <tr><td>${stage}</td><td><strong>${count}</strong></td><td>${Math.round(((count as number) / totalLeads) * 100)}%</td></tr>
    `).join('')}
  </tbody>
</table>

<h2>Outreach Activity (Scoped to Date Range)</h2>
<table>
  <thead><tr><th>Channel</th><th>Total Actions</th></tr></thead>
  <tbody>
    <tr><td>📞 Calls</td><td><strong>${totalCalls}</strong></td></tr>
    <tr><td>📧 Emails</td><td><strong>${totalEmails}</strong></td></tr>
    <tr><td>💼 LinkedIn</td><td><strong>${totalLinkedIn}</strong></td></tr>
    <tr><td>💬 WhatsApp</td><td><strong>${totalWhatsApp}</strong></td></tr>
    <tr class="highlight"><td>🎉 Meetings Booked</td><td><strong style="color:#166534">${detail.kpis.meetingsBooked}</strong></td></tr>
  </tbody>
</table>

<h2>SDR Campaign Contributions</h2>
<table>
  <thead><tr><th>Rep Name</th><th>Completed Tasks</th><th>Emails</th><th>Calls</th><th>LinkedIn</th><th>WhatsApp</th><th>Meetings</th></tr></thead>
  <tbody>
    ${detail.reps.map((r: any) => `
      <tr>
        <td><strong>${escHtml(r.name)}</strong></td>
        <td>${r.tasksDone}</td>
        <td>${r.emails}</td>
        <td>${r.calls}</td>
        <td>${r.linkedin}</td>
        <td>${r.whatsapp}</td>
        <td><strong style="color:${r.booked > 0 ? '#166534' : '#111'}">${r.booked}</strong></td>
      </tr>
    `).join('')}
  </tbody>
</table>

${detail.sequences && detail.sequences.length > 0 ? `
<h2>Sequence Performance</h2>
<table>
  <thead><tr><th>Sequence</th><th>Enrolled</th><th>Completed</th><th>Reply Rate</th><th>Meetings Booked</th></tr></thead>
  <tbody>
    ${detail.sequences.map((s: any) => `
      <tr>
        <td>${escHtml(s.name)}</td>
        <td>${s.enrolled}</td>
        <td>${s.completed}</td>
        <td><strong>${s.replyRate}%</strong></td>
        <td>${s.meetingsBooked}</td>
      </tr>
    `).join('')}
  </tbody>
</table>
` : ''}

<div class="footer">
  Confidential Client Report — Prepared by TeleStar SDR Team &nbsp;·&nbsp; ${new Date().toLocaleDateString()}
</div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      showToast('Pop-up blocked — allow pop-ups for PDF export', 'error');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 500);
    showToast('Print dialog opened.', 'success');
  };

  // Filters for managers
  const handleClearFilters = () => {
    setFilterSdr('');
    setFilterManager('');
  };

  // Client-side filtering of campaigns list in Overview based on manager dropdown choices
  const filteredCampaigns = useMemo(() => {
    const podRepIds = filterManager
      ? users.filter((u) => u.managerId === filterManager).map((u: any) => u.id)
      : [];
    const allowedIds = filterManager ? [filterManager, ...podRepIds] : null;

    return campaigns.filter((c) => {
      if (filterSdr && !c.campaignSdrs?.some((s: any) => s.userId === filterSdr)) return false;
      if (allowedIds && !c.campaignSdrs?.some((s: any) => allowedIds.includes(s.userId))) return false;
      return true;
    });
  }, [campaigns, filterSdr, filterManager, users]);

  if (isSessionLoading || !isManager) {
    return null;
  }

  const isSdr = currentRole === 'sdr';

  return (
    <div className="space-y-6 flex-1 flex flex-col animate-in fade-in duration-200">
      {/* Title block */}
      <div className="page-hero flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            {isSdr ? 'My Campaign Performance' : 'Organization Team View'}
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {isSdr
              ? 'Performance tracking, metrics conversion, and export summaries for your campaign.'
              : 'Aggregate coaching leaderboards, pipeline analysis, and client report exports.'}
          </p>
        </div>
      </div>

      {/* Tabs and Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card-bg border border-card-border rounded-2xl px-4 py-3 shadow-sm">
        {/* Tab switcher: Only shown for managers */}
        {!isSdr ? (
          <div className="flex bg-background border border-card-border rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => {
                setActiveTab('campaigns');
                setSelectedCampaignId(null);
                setCampaignDetail(null);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeTab === 'campaigns'
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Campaigns
            </button>
            <button
              onClick={() => {
                setActiveTab('performance');
                setSelectedCampaignId(null);
                setCampaignDetail(null);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeTab === 'performance'
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Team Performance
            </button>
            <button
              onClick={() => {
                setActiveTab('progress');
                setSelectedCampaignId(null);
                setCampaignDetail(null);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeTab === 'progress'
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Rep Progress & Conversion
            </button>
            <button
              onClick={() => {
                setActiveTab('sequences');
                setSelectedCampaignId(null);
                setCampaignDetail(null);
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                activeTab === 'sequences'
                  ? 'bg-brand-red text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Sequences
            </button>
            {['director', 'floor_manager'].includes(currentRole || '') && (
              <button
                onClick={() => {
                  setActiveTab('meetings');
                  setSelectedCampaignId(null);
                  setCampaignDetail(null);
                }}
                className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  activeTab === 'meetings'
                    ? 'bg-brand-red text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Meetings Console
              </button>
            )}
          </div>
        ) : (
          <div className="text-xs font-mono font-bold text-brand-orange uppercase">
            SDR Workspace Scoped
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* Date range filter */}
          <div className="flex bg-background border border-card-border rounded-lg p-0.5 gap-0.5">
            {(['today', 'week', 'month'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono capitalize transition-all ${
                  dateRange === r ? 'bg-brand-red text-white shadow-sm' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>

          {/* Pod and SDR filters: Managers only, hidden when Campaign Detail drill-down is open */}
          {!isSdr && !selectedCampaignId && (
            <>
              {/* Pod filter */}
              {users.filter((u) => u.role === 'team_lead' || u.role === 'floor_manager').length > 0 && (
                <select
                  value={filterManager}
                  onChange={(e) => {
                    setFilterManager(e.target.value);
                    setFilterSdr('');
                  }}
                  className="bg-background border border-card-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-brand-red font-mono"
                >
                  <option value="">All Pods</option>
                  {users
                    .filter((u) => u.role === 'floor_manager')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        FM: {u.firstName} {u.lastName}
                      </option>
                    ))}
                  {users
                    .filter((u) => u.role === 'team_lead')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        TL: {u.firstName} {u.lastName}
                      </option>
                    ))}
                </select>
              )}

              {/* SDR filter */}
              <select
                value={filterSdr}
                onChange={(e) => {
                  setFilterSdr(e.target.value);
                  setFilterManager('');
                }}
                className="bg-background border border-card-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-brand-red font-mono"
              >
                <option value="">All SDRs</option>
                {users
                  .filter((u) => u.role === 'sdr')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
              </select>

              {(filterSdr || filterManager) && (
                <button
                  onClick={handleClearFilters}
                  className="text-[10px] font-mono text-text-muted hover:text-brand-red transition-colors"
                >
                  Clear ✕
                </button>
              )}
            </>
          )}

          <span className="text-[10px] font-mono text-text-muted inline">
            {dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'This week' : 'This month'}
          </span>
        </div>
      </div>

      {/* Main content grid */}
      <div className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin" />
          </div>
        ) : activeTab === 'campaigns' ? (
          selectedCampaignId && campaignDetail ? (
            <CampaignDetail
              data={campaignDetail}
              onBack={() => {
                setSelectedCampaignId(null);
                setCampaignDetail(null);
              }}
              dateRange={dateRange}
              onExportPDF={() => handleExportPDF(campaignDetail)}
              onExportCSV={() => handleExportCSV(campaignDetail)}
              showTabsSwitcher={!isSdr}
              canExport={canImportExport(currentRole)}
            />
          ) : (
            <CampaignOverview
              campaigns={filteredCampaigns}
              onSelectCampaign={setSelectedCampaignId}
              dateRange={dateRange}
            />
          )
        ) : activeTab === 'meetings' ? (
          <MeetingsBoard onSelectLead={setSelectedLeadId} />
        ) : activeTab === 'progress' ? (
          <RepProgressTracker users={users} dateRange={dateRange} />
        ) : activeTab === 'sequences' ? (
          <SequencePerformanceReport
            stats={seqStats}
            scopeLabel={
              currentRole === 'director'
                ? 'Org-wide'
                : currentRole === 'floor_manager'
                ? 'Across your floor'
                : currentRole === 'team_lead'
                ? 'Across your pod'
                : undefined
            }
          />
        ) : (
          /* Performance Tab: leaderboard + alerts side-by-side */
          <div className="space-y-6">
            <TeamLeaderboard leaderboard={leaderboard} dateRange={dateRange} />
            {alerts && (
              <OverdueAlerts
                users={alerts.users}
                atRiskLeads={alerts.atRiskLeads}
                onSelectLead={setSelectedLeadId}
              />
            )}
          </div>
        )}
      </div>

      {/* Lead Detail Slide-over Panel */}
      {selectedLeadId && (
        <LeadDetailPanel leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      )}
    </div>
  );
}
