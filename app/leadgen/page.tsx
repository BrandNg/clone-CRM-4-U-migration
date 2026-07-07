'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Target,
  Upload,
  Download,
  KanbanSquare,
  TableProperties,
  Search,
  Users,
  ArrowRight,
  Flame,
  Minus,
  CheckCircle2,
  Tag,
  Shuffle,
  FileSpreadsheet,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import LeadgenTeamProgress from '@/components/leadgen/LeadgenTeamProgress';
import SequencePerformanceReport from '@/components/SequencePerformanceReport';
import type { ScopedSequenceStats } from '@/lib/sequences/analytics';

// On-demand chunks — the slide-over and import modal render only on interaction.
const LeadDetailPanel = dynamic(() => import('@/components/LeadDetailPanel'), { ssr: false });
const CSVImportModal = dynamic(() => import('@/components/CSVImportModal'), { ssr: false });

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title?: string;
  email: string;
  phone?: string;
  linkedIn?: string;
  stage: 'new' | 'sequence_active' | 'replied' | 'meeting_booked' | 'won' | 'lost';
  priority: 'hot' | 'warm' | 'cold';
  source?: string;
  lastContactedAt?: string;
  nextTaskDue?: string;
  nextTaskType?: string | null;
  tags?: string[];
  assignedTo?: { id: string; firstName: string; lastName: string };
  campaign?: { id: string; name: string };
  createdAt?: string;
}

const STAGE_CONFIG: Record<string, { label: string; color: string; dotColor: string }> = {
  new:             { label: 'New',            color: 'bg-zinc-800 border-zinc-700', dotColor: 'bg-zinc-400' },
  sequence_active: { label: 'In Sequence',    color: 'bg-blue-950 border-blue-800', dotColor: 'bg-blue-400' },
  replied:         { label: 'Replied',        color: 'bg-amber-950 border-amber-800', dotColor: 'bg-amber-400' },
  meeting_booked:  { label: 'Meeting Booked', color: 'bg-emerald-950 border-emerald-800', dotColor: 'bg-emerald-400' },
  won:             { label: 'Won',            color: 'bg-green-950 border-green-800', dotColor: 'bg-green-500' },
  lost:            { label: 'Lost',           color: 'bg-red-950 border-red-900', dotColor: 'bg-red-500' },
};

const PRIORITY_CONFIG = {
  hot:  { label: 'Hot',  class: 'bg-brand-red/10 text-brand-red border border-brand-red/20', icon: Flame },
  warm: { label: 'Warm', class: 'bg-amber-500/10 text-amber-400 border border-amber-500/20', icon: Minus },
  cold: { label: 'Cold', class: 'bg-zinc-700/40 text-zinc-400 border border-zinc-700/40', icon: Minus },
};

const KANBAN_STAGES = ['new', 'replied', 'meeting_booked', 'won'] as const;

export default function LeadgenPage() {
  const { currentRole, isSessionLoading } = useAppContext();
  const { showToast } = useToast();
  const router = useRouter();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Leadgen Manager custom states
  const [scope, setScope] = useState<{ kind: 'manager' | 'member'; campaignIds?: string[] } | null>(null);
  const [seqStats, setSeqStats] = useState<ScopedSequenceStats | null>(null);
  const [managerTab, setManagerTab] = useState<'assign' | 'enrich' | 'outcomes' | 'intake' | 'progress'>('assign');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [routeCampaignId, setRouteCampaignId] = useState('');
  const [routeSdrId, setRouteSdrId] = useState('');
  const [routing, setRouting] = useState(false);

  // Gate access. Wait for the session to resolve first: while it loads, `currentRole`
  // falls back to 'sdr' (AppContext), which would otherwise bounce a real leadgen user
  // to '/' — and the dashboard then redirects them back here, causing a bounce loop.
  useEffect(() => {
    if (!isSessionLoading && currentRole !== 'leadgen') {
      router.replace('/');
    }
  }, [isSessionLoading, currentRole, router]);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    const res = await fetch('/api/leads');
    if (res.ok) {
      const data = await res.json();
      setLeads(data);
    }
    setIsLoading(false);
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      setTeamMembers(data.filter((u: any) => u.role === 'sdr' || u.role === 'leadgen'));
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch('/api/campaigns');
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data);
    }
  }, []);

  useEffect(() => {
    if (currentRole === 'leadgen') {
      fetchLeads();
      fetchTeamMembers();
      fetchCampaigns();

      // Get scope; Leadgen Managers also load the scoped sequence-performance report.
      fetch('/api/leadgen/scope')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setScope(data);
          if (data?.kind === 'manager') {
            fetch('/api/sequences/team-analytics')
              .then((r) => (r.ok ? r.json() : null))
              .then((s) => { if (s) setSeqStats(s); })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [currentRole, fetchLeads, fetchTeamMembers, fetchCampaigns]);

  const handleExport = async (filteredLeads: Lead[]) => {
    setIsExporting(true);
    try {
      const headers = ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'Stage', 'Priority', 'Assigned To', 'Campaign', 'Tags'];
      const rows = filteredLeads.map((l) => [
        l.firstName,
        l.lastName,
        l.company,
        l.title ?? '',
        l.email,
        l.phone ?? '',
        l.stage,
        l.priority,
        l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '',
        l.campaign?.name ?? '',
        (l.tags ?? []).join('; '),
      ]);
      const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leadgen-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported leads as CSV', 'success');
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkRoute = async () => {
    if (selectedLeads.size === 0) return;
    if (!routeCampaignId && !routeSdrId) {
      showToast('Select a target Campaign or Rep to assign', 'info');
      return;
    }

    setRouting(true);
    try {
      const res = await fetch('/api/leadgen/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeads),
          campaignId: routeCampaignId || undefined,
          assignedToId: routeSdrId || undefined,
        }),
      });

      if (res.ok) {
        showToast('Successfully routed selected prospects', 'success');
        setSelectedLeads(new Set());
        setRouteCampaignId('');
        setRouteSdrId('');
        fetchLeads();
      } else {
        showToast('Failed to assign prospects', 'error');
      }
    } catch {
      showToast('Network error during routing', 'error');
    } finally {
      setRouting(false);
    }
  };

  if (currentRole !== 'leadgen' || !scope) return null;

  const isManager = scope.kind === 'manager';

  // Stats calculation
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const importedThisWeek = leads.filter(
    (l) => l.source === 'csv-import' && l.createdAt && new Date(l.createdAt) >= weekAgo
  ).length;

  const readyToHandOff = leads.filter(
    (l) => l.stage === 'replied' || l.stage === 'meeting_booked'
  ).length;

  // Filtered list
  const filtered = leads.filter((l) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.firstName.toLowerCase().includes(q) &&
        !l.lastName.toLowerCase().includes(q) &&
        !l.company.toLowerCase().includes(q) &&
        !l.email.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterMember && l.assignedTo?.id !== filterMember) return false;
    if (filterPriority && l.priority !== filterPriority) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-card-border bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-sm text-text-primary">
              {isManager ? 'Leadgen Manager Console' : 'Leadgen Pipeline'}
            </h1>
            <p className="text-[10px] text-text-muted font-mono uppercase">
              {isManager ? 'Campaign routing · Prospect assignment · Intent tracking' : 'Import · Qualify · Hand off'}
            </p>
          </div>
        </div>

        {/* Global CSV Import only on Header for Managers */}
        {isManager && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-300 text-xs font-semibold rounded-lg transition-all active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Prospects
            </button>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="px-6 py-3 border-b border-card-border bg-background flex-shrink-0">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Leads Pool', value: leads.length, icon: Target, color: 'text-purple-400' },
            { label: 'Imported This Week', value: importedThisWeek, icon: Upload, color: 'text-blue-400' },
            { label: 'Qualified (Ready for SDR)', value: readyToHandOff, icon: ArrowRight, color: 'text-emerald-400' },
            { label: 'Assigned Outreach Reps', value: teamMembers.filter((u) => u.role === 'sdr').length, icon: Users, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card-bg border border-card-border rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
              <div>
                <div className="text-xl font-bold text-text-primary font-display">{value}</div>
                <div className="text-[10px] text-text-muted font-mono uppercase tracking-wide">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LEADGEN MANAGER MODE */}
      {isManager ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Selector */}
          <div className="px-6 py-2 border-b border-card-border bg-background flex items-center gap-2 flex-shrink-0">
            {[
              { id: 'assign', label: 'Route & Assign', icon: Shuffle },
              { id: 'enrich', label: 'Enrich & Intent Board', icon: Tag },
              { id: 'outcomes', label: 'Outcomes & Reports', icon: CheckCircle2 },
              { id: 'progress', label: 'Leadgen Team Progress', icon: Users },
              { id: 'intake', label: 'Intake Controls', icon: Upload },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setManagerTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    managerTab === tab.id
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                      : 'text-text-secondary hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Contents */}
          <div className="flex-1 overflow-auto p-6">
            
            {/* T1: Route & Assign */}
            {managerTab === 'assign' && (
              <div className="space-y-4 h-full flex flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-card-bg border border-card-border rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono text-purple-300 uppercase">Bulk Assign:</span>
                    <select
                      value={routeCampaignId}
                      onChange={(e) => setRouteCampaignId(e.target.value)}
                      className="bg-background border border-card-border rounded-xl text-xs font-semibold px-2 py-1 text-text-primary focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="">— Select Target Campaign —</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={routeSdrId}
                      onChange={(e) => setRouteSdrId(e.target.value)}
                      className="bg-background border border-card-border rounded-xl text-xs font-semibold px-2 py-1 text-text-primary focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="">— Select Target Rep (SDR) —</option>
                      {teamMembers.filter((u) => u.role === 'sdr').map((u) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleBulkRoute}
                      disabled={routing || selectedLeads.size === 0}
                      className="px-4 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {routing ? 'Assigning…' : 'Route Selection'}
                    </button>
                  </div>
                  <span className="text-xs font-mono text-text-muted">{selectedLeads.size} selected</span>
                </div>

                <div className="flex-1 bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                        <th className="p-3 w-8">
                          <input
                            type="checkbox"
                            checked={filtered.length > 0 && filtered.every((l) => selectedLeads.has(l.id))}
                            onChange={() => {
                              if (filtered.every((l) => selectedLeads.has(l.id))) {
                                setSelectedLeads(new Set());
                              } else {
                                setSelectedLeads(new Set(filtered.map((l) => l.id)));
                              }
                            }}
                          />
                        </th>
                        <th className="p-3">Name</th>
                        <th className="p-3">Company</th>
                        <th className="p-3">Target Campaign</th>
                        <th className="p-3">Assigned Rep</th>
                        <th className="p-3">Stage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border text-text-secondary overflow-y-auto">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-text-muted">No prospects found.</td>
                        </tr>
                      ) : (
                        filtered.map((lead) => (
                          <tr key={lead.id} className="hover:bg-background/40 cursor-pointer" onClick={() => setSelectedLeadId(lead.id)}>
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedLeads.has(lead.id)}
                                onChange={() => {
                                  setSelectedLeads((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id);
                                    return next;
                                  });
                                }}
                              />
                            </td>
                            <td className="p-3 font-semibold text-text-primary">{lead.firstName} {lead.lastName}</td>
                            <td className="p-3">{lead.company}</td>
                            <td className="p-3">
                              {lead.campaign ? (
                                <span className="font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[10px]">
                                  {lead.campaign.name}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="p-3 text-text-muted">
                              {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'}
                            </td>
                            <td className="p-3 capitalize">{lead.stage.replace('_', ' ')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* T2: Enrich & Intent Board */}
            {managerTab === 'enrich' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Filter by name/company…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-card-bg border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>

                <div className="bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                        <th className="p-3">Prospect</th>
                        <th className="p-3">Job Title</th>
                        <th className="p-3">Enriched Contact Info</th>
                        <th className="p-3">Custom Tags</th>
                        <th className="p-3">Lead Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border text-text-secondary">
                      {filtered.map((lead) => {
                        const priCfg = PRIORITY_CONFIG[lead.priority] ?? PRIORITY_CONFIG.warm;
                        return (
                          <tr
                            key={lead.id}
                            className="hover:bg-purple-500/5 cursor-pointer"
                            onClick={() => setSelectedLeadId(lead.id)}
                          >
                            <td className="p-3">
                              <p className="font-semibold text-text-primary">{lead.firstName} {lead.lastName}</p>
                              <p className="text-[10px] text-text-muted">{lead.company}</p>
                            </td>
                            <td className="p-3 font-mono text-[10px]">{lead.title || '—'}</td>
                            <td className="p-3">
                              <p className="font-mono text-[10px]">{lead.email}</p>
                              <p className="text-[10px] text-text-muted font-mono">{lead.phone || '—'}</p>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {(lead.tags ?? []).map((t) => (
                                  <span key={t} className="bg-purple-500/10 border border-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[9px]">
                                    {t}
                                  </span>
                                ))}
                                {(lead.tags ?? []).length === 0 && <span className="text-text-muted italic">—</span>}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priCfg.class}`}>
                                {priCfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* T3: Outcomes & Reports */}
            {managerTab === 'outcomes' && (
              <div className="space-y-6">
                {/* Scoped sequence performance across the leadgen manager's accounts */}
                <SequencePerformanceReport stats={seqStats} scopeLabel="Across your accounts" />

                {/* Outcomes Grid */}
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Replied Leads', count: leads.filter((l) => l.stage === 'replied').length, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { label: 'Meetings Booked', count: leads.filter((l) => l.stage === 'meeting_booked').length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                    { label: 'Deals Won', count: leads.filter((l) => l.stage === 'won').length, color: 'text-green-400', bg: 'bg-green-500/10' },
                    { label: 'Deals Lost', count: leads.filter((l) => l.stage === 'lost').length, color: 'text-red-400', bg: 'bg-red-500/10' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-card-bg border border-card-border p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-text-primary font-display">{stat.count}</p>
                        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">{stat.label}</span>
                      </div>
                      <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center ${stat.color} font-bold`}>
                        ✓
                      </div>
                    </div>
                  ))}
                </div>

                {/* Meetings Outcomes List */}
                <div className="space-y-3">
                  <h3 className="font-display font-extrabold text-sm text-text-primary">
                    Booked Meetings & Sales Outcomes
                  </h3>
                  <div className="bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                          <th className="p-3">Prospect</th>
                          <th className="p-3">Campaign</th>
                          <th className="p-3">Assigned SDR</th>
                          <th className="p-3">Current Stage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border text-text-secondary">
                        {leads.filter((l) => ['meeting_booked', 'won', 'lost'].includes(l.stage)).length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-text-muted italic">
                              No meeting bookings recorded yet.
                            </td>
                          </tr>
                        ) : (
                          leads
                            .filter((l) => ['meeting_booked', 'won', 'lost'].includes(l.stage))
                            .slice(0, 10)
                            .map((l) => (
                              <tr
                                key={l.id}
                                className="hover:bg-purple-500/5 cursor-pointer"
                                onClick={() => setSelectedLeadId(l.id)}
                              >
                                <td className="p-3">
                                  <p className="font-semibold text-text-primary">{l.firstName} {l.lastName}</p>
                                  <p className="text-[10px] text-text-muted">{l.company}</p>
                                </td>
                                <td className="p-3">
                                  <span className="font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[10px]">
                                    {l.campaign?.name || '—'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {l.assignedTo ? `${l.assignedTo.firstName} ${l.assignedTo.lastName}` : '—'}
                                </td>
                                <td className="p-3">
                                  {l.stage === 'won' ? (
                                    <span className="text-green-500 font-bold uppercase text-[10px]">Won</span>
                                  ) : l.stage === 'lost' ? (
                                    <span className="text-brand-red font-bold uppercase text-[10px]">Lost</span>
                                  ) : (
                                    <span className="text-blue-400 font-bold uppercase text-[10px]">Scheduled</span>
                                  )}
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Daily Export Action Card */}
                <div className="bg-card-bg border border-card-border p-6 rounded-2xl flex flex-row justify-between items-center gap-4">
                  <div className="space-y-1">
                    <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-purple-400" />
                      <span>Daily Export outcomes</span>
                    </h3>
                    <p className="text-xs text-text-secondary max-w-md">
                      Download a structured CSV containing lead details, enrichment attributes, priority scores, and the final outcomes.
                    </p>
                  </div>
                  <button
                    onClick={() => handleExport(leads)}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isExporting ? 'Exporting…' : 'Export Outcome Data'}
                  </button>
                </div>
              </div>
            )}

            {/* T4: Intake Controls */}
            {managerTab === 'intake' && (
              <div className="bg-card-bg border border-card-border p-8 rounded-2xl max-w-md mx-auto text-center space-y-4">
                <Upload className="w-10 h-10 text-purple-400 mx-auto opacity-70" />
                <div className="space-y-1">
                  <h3 className="font-display font-bold text-sm text-text-primary">Bulk Intake Upload</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Upload and clean prospects spreadsheets (.csv or .xlsx) using customized deduplication rules.
                  </p>
                </div>
                <button
                  onClick={() => setShowImport(true)}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 shadow-sm shadow-purple-600/10"
                >
                  Launch CSV Import Tool
                </button>
              </div>
            )}

            {/* T5: Leadgen Team Progress */}
            {managerTab === 'progress' && (
              <LeadgenTeamProgress />
            )}
          </div>
        </div>
      ) : (
        /* STANDARD LEADGEN MEMBER VIEW (Kanban / Table) */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-2.5 border-b border-card-border bg-background flex items-center gap-3 flex-shrink-0">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                placeholder="Search leads…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-card-bg border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-purple-500/50"
              />
            </div>

            <select
              value={filterMember}
              onChange={(e) => setFilterMember(e.target.value)}
              className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-purple-500/50"
            >
              <option value="">All Members</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                </option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-purple-500/50"
            >
              <option value="">All Priorities</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </select>

            <div className="ml-auto flex items-center gap-1 bg-card-bg border border-card-border rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('kanban')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-purple-500/15 text-purple-300'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <KanbanSquare className="w-3.5 h-3.5" />
                Kanban
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-purple-500/15 text-purple-300'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                Table
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Target className="w-10 h-10 text-text-muted mb-3 opacity-40" />
                <p className="text-sm text-text-muted">No leads found.</p>
              </div>
            ) : viewMode === 'kanban' ? (
              <KanbanView leads={filtered} onSelectLead={setSelectedLeadId} />
            ) : (
              <TableView leads={filtered} onSelectLead={setSelectedLeadId} />
            )}
          </div>
        </div>
      )}

      {/* Lead detail slide-over */}
      {selectedLeadId && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onLeadUpdate={fetchLeads}
        />
      )}

      {/* CSV Import modal */}
      {showImport && (
        <CSVImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            fetchLeads();
            showToast('Prospects imported successfully', 'success');
          }}
        />
      )}
    </div>
  );
}

// ─── Kanban View ─────────────────────────────────────────────────────────────

function KanbanView({ leads, onSelectLead }: { leads: Lead[]; onSelectLead: (id: string) => void }) {
  const byStage = (stage: string) => leads.filter((l) => l.stage === stage);

  return (
    <div className="flex gap-4 h-full overflow-x-auto pb-2">
      {KANBAN_STAGES.map((stage) => {
        const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.new;
        const stageLeads = byStage(stage);
        return (
          <div key={stage} className="flex-shrink-0 w-64">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                <span className="text-xs font-semibold text-text-secondary">{cfg.label}</span>
              </div>
              <span className="text-[10px] font-mono text-text-muted bg-card-bg border border-card-border rounded px-1.5 py-0.5">
                {stageLeads.length}
              </span>
            </div>
            <div className="space-y-2">
              {stageLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead.id)} />
              ))}
              {stageLeads.length === 0 && (
                <div className="border border-dashed border-card-border rounded-xl h-20 flex items-center justify-center">
                  <span className="text-[10px] text-text-muted">No leads</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const priCfg = PRIORITY_CONFIG[lead.priority] ?? PRIORITY_CONFIG.warm;
  const PriIcon = priCfg.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card-bg border border-card-border rounded-xl p-3 hover:border-purple-500/30 hover:bg-card-bg/80 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary truncate">
            {lead.firstName} {lead.lastName}
          </p>
          <p className="text-[10px] text-text-muted truncate">{lead.company}</p>
        </div>
        <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${priCfg.class}`}>
          <PriIcon className="w-2.5 h-2.5" />
          {priCfg.label}
        </span>
      </div>
      {lead.campaign && (
        <p className="text-[10px] text-purple-300 font-semibold truncate">
          ⛺ {lead.campaign.name}
        </p>
      )}
      {lead.assignedTo && (
        <p className="text-[10px] text-text-muted truncate mt-0.5">
          → {lead.assignedTo.firstName} {lead.assignedTo.lastName}
        </p>
      )}
    </button>
  );
}

// ─── Table View ──────────────────────────────────────────────────────────────

function TableView({ leads, onSelectLead }: { leads: Lead[]; onSelectLead: (id: string) => void }) {
  return (
    <div className="bg-card-bg border border-card-border rounded-xl overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-card-border text-text-muted font-mono uppercase text-[10px]">
            <th className="text-left px-4 py-2.5 font-medium">Name</th>
            <th className="text-left px-4 py-2.5 font-medium">Company</th>
            <th className="text-left px-4 py-2.5 font-medium">Stage</th>
            <th className="text-left px-4 py-2.5 font-medium">Priority</th>
            <th className="text-left px-4 py-2.5 font-medium">Assigned</th>
            <th className="text-left px-4 py-2.5 font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, idx) => {
            const stageCfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new;
            const priCfg = PRIORITY_CONFIG[lead.priority] ?? PRIORITY_CONFIG.warm;
            return (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead.id)}
                className={`border-b border-card-border/50 hover:bg-purple-500/5 cursor-pointer transition-colors ${
                  idx % 2 === 0 ? '' : 'bg-background/30'
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-text-primary">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{lead.company}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-medium ${stageCfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stageCfg.dotColor}`} />
                    {stageCfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priCfg.class}`}>
                    {priCfg.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-text-muted">
                  {lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-text-muted font-mono">{lead.email}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
