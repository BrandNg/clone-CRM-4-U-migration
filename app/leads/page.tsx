'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Plus,
  Search,
  SlidersHorizontal,
  KanbanSquare,
  TableProperties,
  Mail,
  Phone,
  Upload,
  ChevronDown,
} from 'lucide-react';
import Linkedin from '@/components/icons/Linkedin';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { canImportExport } from '@/lib/permissions';
import { useLeads, useUsers, useSequences, useUpdateLeadStage } from '@/lib/hooks/useLeads';
import type { Lead } from '@/lib/hooks/useLeads';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';

const LeadDetailPanel = dynamic(() => import('@/components/LeadDetailPanel'), { ssr: false });
const NewLeadModal = dynamic(() => import('@/components/NewLeadModal'), { ssr: false });
const CSVImportModal = dynamic(() => import('@/components/CSVImportModal'), { ssr: false });

// Module-scope constants (stable identity) so they can be omitted from useMemo deps.
const PRIORITY_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const STAGE_RANK: Record<string, number> = { new: 0, sequence_active: 1, replied: 2, meeting_booked: 3, won: 4, lost: 5 };

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// Module-level helper so the time-dependent Date.now() isn't a direct impure call
// inside the LeadCard render body (react-hooks/purity).
function daysOverdueFrom(dateStr?: string): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

interface LeadCardProps {
  lead: Lead;
  onOpen: (id: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

// Memoized so unrelated parent state (search typing, drag-hover on a column,
// filter changes) doesn't re-render every card. Per-card derived values live here
// and recompute only when this lead's props change.
const LeadCard = memo(function LeadCard({ lead, onOpen, onDragStart, onDragEnd }: LeadCardProps) {
  const daysOverdue = daysOverdueFrom(lead.nextTaskDue);
  const atRisk = lead.atRisk ?? false;
  const channelIcon = lead.nextTaskType === 'email' ? '✉' :
    lead.nextTaskType === 'phone' ? '📞' :
    lead.nextTaskType === 'linkedin' ? 'in' :
    lead.nextTaskType === 'whatsapp' ? '💬' : null;
  const channelColor = lead.nextTaskType === 'email' ? 'text-blue-500' :
    lead.nextTaskType === 'phone' ? 'text-green-500' :
    lead.nextTaskType === 'linkedin' ? 'text-indigo-500' :
    lead.nextTaskType === 'whatsapp' ? 'text-emerald-500' : 'text-text-muted';
  const priorityDotColor = lead.priority === 'hot' ? 'bg-brand-red' :
    lead.priority === 'warm' ? 'bg-brand-gold' : 'bg-blue-400';
  const assigneeInitials = lead.assignedTo
    ? `${lead.assignedTo.firstName[0] ?? ''}${lead.assignedTo.lastName[0] ?? ''}`.toUpperCase()
    : null;

  return (
    <div
      onClick={() => onOpen(lead.id)}
      draggable
      onDragStart={(e) => onDragStart(e, lead.id)}
      onDragEnd={onDragEnd}
      className={`p-2.5 glass-card rounded-xl cursor-grab active:cursor-grabbing hover:border-brand-red/50 hover-lift transition-all duration-200 flex flex-col gap-1.5 relative select-none group ${
        lead.priority === 'hot' ? 'glow-hot' : ''
      } ${atRisk ? 'border-amber-500/40' : ''}`}
    >
      {/* Row 1: name + at-risk badge */}
      <div className="flex items-start justify-between gap-1">
        <p className="font-display font-bold text-[13px] text-text-primary leading-snug">
          {lead.firstName} {lead.lastName}
        </p>
        {atRisk && (
          <span
            className="flex-shrink-0 text-[10px] font-bold font-mono bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1 py-0.5 rounded"
            title={`Sequence task overdue ${Math.max(daysOverdue, 3)} days`}
          >
            ⚠ {Math.max(daysOverdue, 3)}d
          </span>
        )}
      </div>

      {/* Row 2: company · title */}
      <p className="text-[11px] text-text-muted truncate leading-tight">
        {lead.company}
        {lead.title ? <span className="text-text-muted/60"> · {lead.title}</span> : null}
      </p>

      {/* Row 3: next task channel + last contacted */}
      {(channelIcon || lead.lastContactedAt) && (
        <div className="flex items-center gap-1.5">
          {channelIcon && (
            <span className={`text-[11px] font-semibold font-mono ${channelColor}`}>{channelIcon}</span>
          )}
          {lead.lastContactedAt && (
            <span className="text-[10px] text-text-muted font-mono">
              {formatRelativeTime(lead.lastContactedAt)}
            </span>
          )}
        </div>
      )}

      {/* Row 4: priority dot + quick-action links + SDR avatar */}
      <div className="flex items-center justify-between pt-1.5 border-t border-card-border/30 mt-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`stage-dot ${priorityDotColor}`} title={lead.priority} aria-label={`Priority: ${lead.priority}`} />
          <span className="text-[10px] text-text-muted font-medium capitalize">{lead.priority}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Quick actions — visible on hover */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); window.location.href = `mailto:${lead.email}`; }}
              title="Email"
              className="text-text-muted hover:text-blue-500 transition-colors text-[11px] p-0.5 rounded"
              aria-label={`Email ${lead.firstName}`}
            >
              ✉
            </button>
            {lead.phone && (
              <button
                onClick={(e) => { e.stopPropagation(); window.location.href = `tel:${lead.phone}`; }}
                title="Call"
                className="text-text-muted hover:text-green-500 transition-colors text-[11px] p-0.5 rounded"
                aria-label={`Call ${lead.firstName}`}
              >
                📞
              </button>
            )}
          </div>
          {/* SDR avatar */}
          {assigneeInitials && (
            <div
              className="avatar-xs bg-brand-red/10 text-brand-red"
              title={`${lead.assignedTo?.firstName} ${lead.assignedTo?.lastName}`}
              aria-label={`Assigned to ${lead.assignedTo?.firstName} ${lead.assignedTo?.lastName}`}
            >
              {assigneeInitials}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default function LeadsPage() {
  const { currentRole } = useAppContext();
  const { showToast } = useToast();

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sdrFilter, setSdrFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState<Record<string, boolean>>({});
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkSdr, setBulkSdr] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkSeqId, setBulkSeqId] = useState('');
  const [sortField, setSortField] = useState<'name' | 'company' | 'stage' | 'priority' | 'assignedTo' | 'lastContacted' | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filters = {
    search: searchQuery || undefined,
    stage: stageFilter,
    priority: priorityFilter,
    assignedTo: sdrFilter,
    source: sourceFilter || undefined,
    tag: tagFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const { data: leads = [] } = useLeads(filters);
  const { data: users = [] } = useUsers();
  const { data: sequences = [] } = useSequences();
  const queryClient = useQueryClient();
  const invalidateLeads = () => queryClient.invalidateQueries({ queryKey: ['leads'] });
  const updateStageMutation = useUpdateLeadStage();

  const handleSetViewMode = (mode: 'kanban' | 'table') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('crm:defaultLeadView', mode);
  };

  useEffect(() => {
    const saved = localStorage.getItem('crm:defaultLeadView');
    if (saved === 'table' || saved === 'kanban') setViewMode(saved);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const leadId = (e as CustomEvent).detail?.leadId;
      if (leadId) setSelectedLeadId(leadId);
    };
    window.addEventListener('crm:open-lead', handler);
    return () => window.removeEventListener('crm:open-lead', handler);
  }, []);

  // useCallback gives these stable identities so the memoized LeadCard doesn't
  // re-render every time the parent re-renders.
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => { e.dataTransfer.setData('text/plain', id); }, []);
  const handleDragEnd = useCallback(() => setIsDraggedOver({}), []);
  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setIsDraggedOver((prev) => ({ ...prev, [colId]: true }));
  };
  const handleDragLeave = (colId: string) => {
    setIsDraggedOver((prev) => ({ ...prev, [colId]: false }));
  };

  const handleDrop = async (e: React.DragEvent, colId: Lead['stage']) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === colId) {
      setIsDraggedOver((prev) => ({ ...prev, [colId]: false }));
      return;
    }
    setIsDraggedOver((prev) => ({ ...prev, [colId]: false }));
    try {
      await updateStageMutation.mutateAsync({ leadId, stage: colId });
      showToast(`Moved to ${colId.replace(/_/g, ' ')}`, 'success');
    } catch {
      showToast('Failed to update stage', 'error');
    }
  };

  const toggleLeadSelect = (id: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (visibleIds: string[]) => {
    if (visibleIds.every((id) => selectedLeads.has(id))) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(visibleIds));
    }
  };

  const applyBulkAction = async () => {
    if (selectedLeads.size === 0) return;
    setBulkApplying(true);
    const ids = Array.from(selectedLeads);
    try {
      if (bulkStage) {
        await Promise.all(ids.map((id) =>
          fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: bulkStage }) })
        ));
        invalidateLeads();
        showToast(`Stage updated for ${ids.length} leads`, 'success');
      }
      if (bulkSdr) {
        await Promise.all(ids.map((id) =>
          fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedToId: bulkSdr }) })
        ));
        invalidateLeads();
        showToast(`Reassigned ${ids.length} leads`, 'success');
      }
      if (bulkSeqId) {
        await Promise.all(ids.map((id) =>
          fetch(`/api/sequences/${bulkSeqId}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: id }) })
        ));
        showToast(`Enrolled ${ids.length} leads in sequence`, 'success');
      }
      setSelectedLeads(new Set());
      setBulkStage('');
      setBulkSdr('');
      setBulkSeqId('');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      if (!sortField) return 0;
      let cmp = 0;
      if (sortField === 'name') cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      else if (sortField === 'company') cmp = (a.company ?? '').localeCompare(b.company ?? '');
      else if (sortField === 'stage') cmp = (STAGE_RANK[a.stage] ?? 99) - (STAGE_RANK[b.stage] ?? 99);
      else if (sortField === 'priority') cmp = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
      else if (sortField === 'assignedTo') cmp = (`${a.assignedTo?.firstName ?? ''}${a.assignedTo?.lastName ?? ''}`).localeCompare(`${b.assignedTo?.firstName ?? ''}${b.assignedTo?.lastName ?? ''}`);
      else if (sortField === 'lastContacted') cmp = (a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0) - (b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [leads, sortField, sortDir]);

  // Render helper, not a component — defining components during render trips
  // the react-hooks/static-components rule and remounts the node every render.
  const renderSortTh = (field: typeof sortField, label: string) => (
    <th
      key={field}
      className="p-3 cursor-pointer select-none hover:text-text-primary transition-colors"
      onClick={() => handleSort(field)}
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="font-mono text-xs">{sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </span>
    </th>
  );

  const columns: { id: Lead['stage']; label: string; color: string; dotColor: string }[] = [
    { id: 'new', label: 'New', color: 'border border-card-border bg-gray-500/5', dotColor: 'bg-gray-400' },
    { id: 'sequence_active', label: 'Seq. Active', color: 'border border-card-border bg-blue-500/5', dotColor: 'bg-blue-500' },
    { id: 'replied', label: 'Replied', color: 'border border-card-border bg-brand-orange/5', dotColor: 'bg-brand-orange' },
    { id: 'meeting_booked', label: 'Meeting', color: 'border border-card-border bg-emerald-500/5', dotColor: 'bg-emerald-500' },
    { id: 'won', label: 'Won', color: 'border border-card-border bg-green-600/5', dotColor: 'bg-green-600' },
    { id: 'lost', label: 'Lost', color: 'border border-card-border bg-brand-red/5', dotColor: 'bg-brand-red' },
  ];

  // Bucket leads by stage once per leads-change instead of filtering the full
  // array inside every kanban column on every render.
  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = { new: [], sequence_active: [], replied: [], meeting_booked: [], won: [], lost: [] };
    for (const l of leads) {
      (map[l.stage] ??= []).push(l);
    }
    return map;
  }, [leads]);

  const stageBadgeClass = (stage: Lead['stage']) => {
    switch (stage) {
      case 'sequence_active': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'replied': return 'bg-brand-orange/10 text-brand-orange border-brand-orange/20';
      case 'meeting_booked': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'won': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'lost': return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const priorityBadgeClass = (priority: Lead['priority']) => {
    switch (priority) {
      case 'hot': return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      case 'warm': return 'bg-brand-gold/10 text-brand-gold border-brand-gold/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const sdrUsers = users.filter((u) => u.role === 'sdr');

  const anyExtraFilter = sdrFilter !== 'all' || sourceFilter || tagFilter || dateFrom || dateTo;
  const extraFilterCount = [sdrFilter !== 'all', !!sourceFilter, !!tagFilter, !!dateFrom, !!dateTo].filter(Boolean).length;
  const clearAllFilters = () => {
    setPriorityFilter('all');
    setStageFilter('all');
    setSdrFilter('all');
    setSearchQuery('');
    setSourceFilter('');
    setTagFilter('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Header */}
      <div className="page-hero flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            Leads Pipeline
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {currentRole === 'sdr'
              ? 'Your assigned outreach prospects.'
              : 'Track and manage your team pipeline.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-auto">
          <div className="flex rounded-lg border border-card-border overflow-hidden shadow-sm">
            <button
              onClick={() => handleSetViewMode('kanban')}
              aria-pressed={viewMode === 'kanban'}
              aria-label="Kanban view"
              title="Kanban view"
              className={`p-2 transition-colors focus-ring ${
                viewMode === 'kanban' ? 'bg-brand-red text-white' : 'bg-card-bg text-text-muted hover:text-text-primary'
              }`}
            >
              <KanbanSquare className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => handleSetViewMode('table')}
              aria-pressed={viewMode === 'table'}
              aria-label="Table view"
              title="Table view"
              className={`p-2 transition-colors focus-ring border-l border-card-border ${
                viewMode === 'table' ? 'bg-brand-red text-white' : 'bg-card-bg text-text-muted hover:text-text-primary'
              }`}
            >
              <TableProperties className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          {canImportExport(currentRole) && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-card-bg border border-card-border hover:bg-background text-text-primary text-xs font-semibold rounded-lg shadow-sm transition-colors focus-ring"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Import CSV</span>
            </button>
          )}
          <button
            onClick={() => setShowNewLeadModal(true)}
            aria-label="Add new lead to pipeline"
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors hover:scale-[1.02] active:scale-[0.97] focus-ring"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Add Lead</span>
          </button>
        </div>
      </div>

      {/* Filters Toolbar — progressive disclosure */}
      <div className="glass-card rounded-xl p-3">
        <div className="flex flex-row items-center gap-3">
          {/* Search */}
          <div className="relative max-w-xs flex-shrink-0">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Search name, email, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-background border border-card-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red"
            />
          </div>

          {/* Always-visible filters */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="bg-background border border-card-border rounded-lg text-xs px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
          >
            <option value="all">All Stages</option>
            <option value="new">New</option>
            <option value="sequence_active">Sequence Active</option>
            <option value="replied">Replied</option>
            <option value="meeting_booked">Meeting Booked</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-background border border-card-border rounded-lg text-xs px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="hot">🔥 Hot</option>
            <option value="warm">⚡ Warm</option>
            <option value="cold">❄️ Cold</option>
          </select>

          {/* + Filters toggle */}
          <button
            onClick={() => setShowExtraFilters(!showExtraFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showExtraFilters || anyExtraFilter
                ? 'bg-brand-red/10 text-brand-red border-brand-red/25'
                : 'bg-background border-card-border text-text-secondary hover:text-text-primary'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {extraFilterCount > 0 && (
              <span className="ml-0.5 bg-brand-red text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {extraFilterCount}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showExtraFilters ? 'rotate-180' : ''}`} />
          </button>

          {(priorityFilter !== 'all' || stageFilter !== 'all' || searchQuery || anyExtraFilter) && (
            <button
              onClick={clearAllFilters}
              className="text-xs font-mono text-brand-red hover:underline whitespace-nowrap"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Extra filters row */}
        {showExtraFilters && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-card-border">
            {currentRole !== 'sdr' && sdrUsers.length > 0 && (
              <select
                value={sdrFilter}
                onChange={(e) => setSdrFilter(e.target.value)}
                className="bg-background border border-card-border rounded-lg text-xs px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
              >
                <option value="all">All Reps</option>
                {sdrUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Source…"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-background border border-card-border rounded-lg text-xs px-2.5 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red w-28"
            />
            <input
              type="text"
              placeholder="Tag…"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-background border border-card-border rounded-lg text-xs px-2.5 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red w-28"
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="Created from"
              className="bg-background border border-card-border rounded-lg text-xs px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-mono w-32"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="Created to"
              className="bg-background border border-card-border rounded-lg text-xs px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-mono w-32"
            />
          </div>
        )}
      </div>

      {/* Leads Content */}
      {viewMode === 'kanban' ? (
        <div className="flex gap-4 flex-1 items-stretch overflow-x-auto pb-2">
          {columns.map((col) => {
            const colLeads = leadsByStage[col.id] ?? [];
            const isHovered = isDraggedOver[col.id];

            return (
              <div
                key={col.id}
                role="region"
                aria-label={`${col.label} — ${colLeads.length} leads`}
                aria-dropeffect="move"
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={() => handleDragLeave(col.id)}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`rounded-2xl border flex flex-col p-3.5 shadow-sm min-h-[400px] w-[300px] flex-shrink-0 transition-colors duration-200 ${
                  isHovered ? 'border-brand-red border-dashed bg-brand-red/[0.03]' : col.color
                }`}
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-card-border/50 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`stage-dot ${col.dotColor}`} aria-hidden="true" />
                    <span className="font-display font-bold text-xs text-text-primary">{col.label}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-text-muted">
                    {colLeads.length}
                  </span>
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
                  {colLeads.length === 0 ? (
                    <div className="h-20 border border-dashed border-card-border/60 rounded-xl flex items-center justify-center text-xs text-text-muted italic">
                      Empty stage
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        onOpen={setSelectedLeadId}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm">
          {/* Bulk action bar */}
          {selectedLeads.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-brand-red/5 border-b border-brand-red/15 text-xs">
              <span className="font-bold text-brand-red font-mono">{selectedLeads.size} selected</span>
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                className="bg-background border border-card-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:border-brand-red"
              >
                <option value="">Change Stage…</option>
                {['new', 'sequence_active', 'replied', 'meeting_booked', 'won', 'lost'].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
              {users.length > 0 && (
                <select
                  value={bulkSdr}
                  onChange={(e) => setBulkSdr(e.target.value)}
                  className="bg-background border border-card-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:border-brand-red"
                >
                  <option value="">Assign SDR…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              )}
              {sequences.length > 0 && (
                <select
                  value={bulkSeqId}
                  onChange={(e) => setBulkSeqId(e.target.value)}
                  className="bg-background border border-card-border rounded-lg px-2 py-1 text-text-primary focus:outline-none focus:border-brand-red"
                >
                  <option value="">Add to Sequence…</option>
                  {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <button
                onClick={applyBulkAction}
                disabled={bulkApplying || (!bulkStage && !bulkSdr && !bulkSeqId)}
                className="px-3 py-1 bg-brand-red hover:bg-brand-orange text-white rounded-lg font-bold font-mono disabled:opacity-50 transition-colors"
              >
                {bulkApplying ? 'Applying…' : 'Apply'}
              </button>
              <button onClick={() => setSelectedLeads(new Set())} className="text-text-muted hover:text-text-primary font-mono">
                Clear
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-background/50 border-b border-card-border text-xs uppercase font-bold font-mono tracking-wider text-text-muted">
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={sortedLeads.length > 0 && sortedLeads.every((l) => selectedLeads.has(l.id))}
                      onChange={() => toggleSelectAll(sortedLeads.map((l) => l.id))}
                      className="rounded border-card-border"
                      aria-label="Select all leads"
                    />
                  </th>
                  {renderSortTh('name', 'Name')}
                  {renderSortTh('company', 'Company')}
                  {renderSortTh('stage', 'Stage')}
                  {renderSortTh('priority', 'Priority')}
                  {renderSortTh('assignedTo', 'Assigned')}
                  {renderSortTh('lastContacted', 'Last Contact')}
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border text-text-secondary">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-text-muted">
                      No leads match the active search or filters.
                    </td>
                  </tr>
                ) : (
                  sortedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`hover:bg-background/40 cursor-pointer table-row-dense ${selectedLeads.has(lead.id) ? 'bg-brand-red/[0.025]' : ''}`}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleLeadSelect(lead.id)}
                          className="rounded border-card-border"
                          aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                        />
                      </td>
                      <td className="p-3 font-semibold text-text-primary whitespace-nowrap">
                        {lead.firstName} {lead.lastName}
                        {lead.atRisk && (
                          <span
                            className="ml-1.5 text-xs font-bold text-amber-500"
                            title="Sequence task overdue 3+ days"
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-semibold">{lead.company}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${stageBadgeClass(lead.stage)}`}>
                          {lead.stage.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${priorityBadgeClass(lead.priority)}`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-text-muted">
                        {lead.assignedTo
                          ? `${lead.assignedTo.firstName}${lead.assignedTo.lastName ? ` ${lead.assignedTo.lastName[0]}.` : ''}`
                          : <span className="text-text-muted/50 italic">Unassigned</span>}
                      </td>
                      <td className="p-3 font-mono text-xs text-text-muted">
                        {lead.lastContactedAt
                          ? new Date(lead.lastContactedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                          : <span className="text-text-muted/50 italic">—</span>}
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1.5 justify-end">
                          <a href={`mailto:${lead.email}`} className="p-1 hover:bg-card-border rounded text-blue-500" title="Send email">
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="p-1 hover:bg-card-border rounded text-green-500" title="Call">
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {lead.linkedIn && (
                            <a href={lead.linkedIn} target="_blank" rel="noreferrer" className="p-1 hover:bg-card-border rounded text-indigo-500" title="LinkedIn">
                              <Linkedin className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedLeadId && (
        <LeadDetailPanel
          leadId={selectedLeadId}
          onLeadUpdate={() => invalidateLeads()}
          onClose={() => {
            setSelectedLeadId(null);
            invalidateLeads();
          }}
        />
      )}

      {showNewLeadModal && (
        <NewLeadModal
          onClose={() => setShowNewLeadModal(false)}
          onSuccess={() => { invalidateLeads(); setShowNewLeadModal(false); }}
        />
      )}

      {showImportModal && (
        <CSVImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); invalidateLeads(); }}
        />
      )}
    </div>
  );
}
