'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Phone,
  MessageSquare,
  Plus,
  Clock,
  Pin,
  Repeat,
  Loader2,
  AlarmClock,
  Check,
} from 'lucide-react';
import Linkedin from '@/components/icons/Linkedin';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';
import { readApiError } from '@/lib/api/client';
import MailComposerModal from '@/components/MailComposerModal';
import dynamic from 'next/dynamic';

const CallDialerModal = dynamic(() => import('@/components/CallDialerModal'), { ssr: false });

interface LeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone?: string;
  linkedIn?: string;
  whatsApp?: string;
  company: string;
  stage: 'new' | 'sequence_active' | 'replied' | 'meeting_booked' | 'won' | 'lost';
  priority: 'hot' | 'warm' | 'cold';
  source?: string;
  importListName?: string | null;
  emailValidation?: string | null;
  emailScore?: number | null;
  vendorSource?: string | null;
  tags: string[];
  lastContactedAt?: string;
  sequenceId?: string | null;
  sequenceStep?: number | null;
  sequenceStatus?: 'active' | 'paused' | null;
  sequence?: { id: string; name: string; steps: any[] } | null;
  notes?: NoteItem[];
  tasks?: TaskItem[];
  assignedTo?: { id: string; firstName: string; lastName: string } | null;
  contact?: {
    fullName?: string | null;
    department?: string | null;
    seniority?: string | null;
    country?: string | null;
    secondaryPhone?: string | null;
    emailValidation?: string | null;
    emailScore?: number | null;
    alternateEmail?: string | null;
  } | null;
  account?: {
    website?: string | null;
    domain?: string | null;
    industry?: string | null;
    country?: string | null;
    companyPhone?: string | null;
    linkedIn?: string | null;
    staffCountRange?: string | null;
    size?: number | null;
  } | null;
  aiScore?: number;
  aiLabel?: 'hot' | 'warm' | 'cold';
  aiInsights?: string[];
  aiRecommendation?: string;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface NoteItem {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string };
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  type: 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'manual';
  status: 'pending' | 'completed' | 'skipped';
  dueDate: string;
  completedAt?: string;
  sequenceStep?: number;
}

interface ReminderItem {
  id: string;
  text: string;
  dueAt: string;
  isDismissed: boolean;
  leadId: string;
}

interface LeadDetailPanelProps {
  leadId: string | null;
  onClose: () => void;
  onLeadUpdate?: (lead: any) => void;
}

export default function LeadDetailPanel({ leadId, onClose, onLeadUpdate }: LeadDetailPanelProps) {
  const { isManager } = useAppContext();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'tasks' | 'sequences'>('info');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const [sequences, setSequences] = useState<{ id: string; name: string; steps: any[]; isActive: boolean }[]>([]);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrollConfirm, setEnrollConfirm] = useState<{ sequenceId: string; sequenceName: string } | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ type: 'email' as TaskItem['type'], title: '', dueDate: '' });
  const [savingTask, setSavingTask] = useState(false);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [newReminderText, setNewReminderText] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [newReminderDate, setNewReminderDate] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{
    firstName: string; lastName: string; company: string; title: string;
    email: string; phone: string; linkedIn: string; whatsApp: string;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [logChannel, setLogChannel] = useState<'email' | 'phone' | 'linkedin' | 'whatsapp'>('phone');
  const [logAction, setLogAction] = useState('');
  const [logNote, setLogNote] = useState('');
  const [logResponse, setLogResponse] = useState(false);
  const [savingLog, setSavingLog] = useState(false);
  const [showDialer, setShowDialer] = useState(false);
  const [adHocActivities, setAdHocActivities] = useState<Array<{
    id: string; type: string; channel: string; metadata: Record<string, unknown>; createdAt: string;
    user: { firstName: string; lastName: string };
  }>>([]);
  const [runningTask, setRunningTask] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      (window as any).__crm_lead_context = null;
      return;
    }
    setLoading(true);
    fetch(`/api/leads/${leadId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setLead(data);
          const sorted = (data.notes ?? []).sort((a: NoteItem, b: NoteItem) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setNotes(sorted);
          setTasks(data.tasks ?? []);

          // Set AI assistant context for the open lead
          const daysSince = data.lastContactedAt
            ? Math.floor((Date.now() - new Date(data.lastContactedAt).getTime()) / 86400000)
            : null;
          (window as any).__crm_lead_context = {
            leadId: data.id,
            leadName: `${data.firstName} ${data.lastName}`,
            leadCompany: data.company,
            leadStage: data.stage,
            ...(daysSince !== null && { leadDaysSinceContact: daysSince }),
            ...(data.campaign?.name && { campaignName: data.campaign.name }),
            ...(data.campaign?.client?.name && { clientName: data.campaign.client.name }),
          };
        }
      })
      .catch(() => showToast('Failed to load lead details', 'error'))
      .finally(() => setLoading(false));

    fetch('/api/sequences')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSequences(data ?? []))
      .catch(() => setSequences([]));

    fetch(`/api/reminders?leadId=${leadId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReminderItem[]) => setReminders((data ?? []).filter((r) => !r.isDismissed)))
      .catch(() => setReminders([]));

    fetch(`/api/activities?leadId=${leadId}&limit=50`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; type: string; channel: string; metadata: Record<string, unknown>; createdAt: string; user: { firstName: string; lastName: string } }>) =>
        setAdHocActivities((data ?? []).filter((a) => a.metadata && (a.metadata as Record<string, unknown>).action))
      )
      .catch(() => setAdHocActivities([]));

    if (isManager && users.length === 0) {
      fetch('/api/users')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setUsers(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [leadId, showToast, users.length, isManager]);

  const timelineItems = React.useMemo(() => {
    interface TimelineItem {
      id: string;
      date: string;
      type: 'note' | 'task_completed' | 'task_skipped' | 'task_pending' | 'activity';
      title: string;
      description: string;
      isPinned?: boolean;
      channel?: string;
    }

    const list: TimelineItem[] = [];

    notes.forEach((n) => {
      list.push({
        id: n.id,
        date: n.createdAt,
        type: 'note',
        title: `${n.createdBy.firstName} ${n.createdBy.lastName}`,
        description: n.content,
        isPinned: n.isPinned,
      });
    });

    tasks.forEach((t) => {
      const type =
        t.status === 'completed'
          ? 'task_completed'
          : t.status === 'skipped'
          ? 'task_skipped'
          : 'task_pending';
      const label =
        t.status === 'completed'
          ? `Completed: ${t.title}`
          : t.status === 'skipped'
          ? `Skipped: ${t.title}`
          : `Scheduled: ${t.title}`;

      list.push({
        id: t.id,
        date: t.completedAt || t.dueDate,
        type,
        title: label,
        description: t.description,
        channel: t.type,
      });
    });

    adHocActivities.forEach((a) => {
      const channelLabel = a.channel ? a.channel.charAt(0).toUpperCase() + a.channel.slice(1) : '';
      const action = (a.metadata.action as string) || '';
      const notes = (a.metadata.notes as string) || '';
      list.push({
        id: a.id,
        date: a.createdAt,
        type: 'activity',
        title: `${a.user.firstName} ${a.user.lastName} — ${channelLabel}: ${action.replace(/_/g, ' ')}`,
        description: notes,
        channel: a.channel,
      });
    });

    if (lead && (lead as any).outboundMessages) {
      ((lead as any).outboundMessages as any[]).forEach((m) => {
        list.push({
          id: m.id,
          date: m.sentAt || m.createdAt,
          type: 'activity',
          title: `Outbound Email: ${m.subject || '— no subject —'}`,
          description: `To: ${m.to} · Status: ${m.status.toUpperCase()}${
            m.errorMessage ? ` · Error: ${m.errorMessage}` : ''
          }${m.body ? `\n\n${m.body}` : ''}`,
          channel: 'email',
        });
      });
    }

    return list.sort((a, b) => {
      const aPinned = a.type === 'note' && a.isPinned;
      const bPinned = b.type === 'note' && b.isPinned;
      if (bPinned !== aPinned) return bPinned ? 1 : -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [notes, tasks, adHocActivities, lead]);

  if (!leadId) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg h-full bg-card-bg border-l border-card-border shadow-2xl flex items-center justify-center z-10">
          <div className="text-text-muted text-xs font-mono animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  if (!lead) return null;

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id, content: newNote }),
    });
    if (res.ok) {
      const created = await res.json();
      setNotes((prev) => {
        const updated = [created, ...prev];
        return updated.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
      setNewNote('');
    } else {
      showToast(await readApiError(res, 'Failed to add note'), 'error');
    }
  };

  const handleTogglePin = async (noteId: string) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const res = await fetch(`/api/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPinned: !note.isPinned }),
    });
    if (res.ok) {
      setNotes((prev) => {
        const updated = prev.map((n) => (n.id === noteId ? { ...n, isPinned: !n.isPinned } : n));
        return updated.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    } else {
      showToast('Failed to pin note', 'error');
    }
  };

  const handleAddReminder = async () => {
    if (!lead) return;
    if (!newReminderText.trim() || !newReminderDate) {
      showToast('Please enter reminder text and a due date', 'error');
      return;
    }
    setSavingReminder(true);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newReminderText.trim(), dueAt: newReminderDate, leadId: lead.id }),
      });
      if (res.ok) {
        const created: ReminderItem = await res.json();
        setReminders((prev) => [...prev, created]);
        setNewReminderText('');
        setNewReminderDate('');
        setShowReminderForm(false);
      showToast('Reminder set', 'success');
      window.dispatchEvent(new CustomEvent('crm:reminder-created'));
    } else {
        showToast(await readApiError(res, 'Failed to create reminder'), 'error');
      }
    } finally {
      setSavingReminder(false);
    }
  };

  const handleDismissReminderInPanel = async (reminderId: string) => {
    const res = await fetch(`/api/reminders/${reminderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDismissed: true }),
    });
    if (res.ok) {
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      window.dispatchEvent(new CustomEvent('crm:notifications-updated'));
    } else {
      showToast(await readApiError(res, 'Failed to dismiss reminder'), 'error');
    }
  };

  const handleStageChange = async (newStage: LeadDetail['stage']) => {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: newStage }),
    });
    if (res.ok) {
      setLead((prev) => (prev ? { ...prev, stage: newStage } : prev));
      if (onLeadUpdate) onLeadUpdate({ ...lead, stage: newStage });
      showToast('Stage updated', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to update stage'), 'error');
    }
  };

  const handlePriorityChange = async (newPriority: LeadDetail['priority']) => {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: newPriority }),
    });
    if (res.ok) {
      setLead((prev) => (prev ? { ...prev, priority: newPriority } : prev));
      if (onLeadUpdate) onLeadUpdate({ ...lead, priority: newPriority });
      showToast('Priority updated', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to update priority'), 'error');
    }
  };

  const handleLogActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !logAction) return;
    setSavingLog(true);
    try {
      const typeMap: Record<string, string> = {
        email: 'email_sent', phone: 'call_logged', linkedin: 'linkedin_touch', whatsapp: 'whatsapp_message',
      };
      const channelLabels: Record<string, string> = {
        email: 'Email', phone: 'Call', linkedin: 'LinkedIn', whatsapp: 'WhatsApp',
      };
      const generatedDescription = `${channelLabels[logChannel] || logChannel} activity logged — ${logAction}${logNote ? `: ${logNote}` : ''}`;
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          type: typeMap[logChannel],
          channel: logChannel,
          description: generatedDescription,
          metadata: { action: logAction, response_received: logResponse, notes: logNote || undefined },
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to log activity'));
      showToast('Activity logged', 'success');
      setAdHocActivities((prev) => [{
        id: Date.now().toString(),
        type: typeMap[logChannel],
        channel: logChannel,
        metadata: { action: logAction, response_received: logResponse, notes: logNote || undefined },
        createdAt: new Date().toISOString(),
        user: { firstName: '', lastName: '' },
      }, ...prev]);
      setShowLogActivity(false);
      setLogAction('');
      setLogNote('');
      setLogResponse(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log activity', 'error');
    } finally {
      setSavingLog(false);
    }
  };

  const handleDialerHangUp = async (notes: string, outcome: string) => {
    if (!lead) return;
    try {
      const typeMap: Record<string, string> = {
        'Connected - Pitching': 'connected_interested',
        'Connected - Meeting Booked': 'connected_meeting_booked',
        'Busy/No Answer': 'no_answer',
        'Gatekeeper Rejection': 'wrong_number',
        'Left Voicemail': 'voicemail_left',
      };
      
      const actionValue = typeMap[outcome] || 'no_answer';
      const generatedDescription = `Outbound call completed. Outcome: ${outcome}${notes ? `: ${notes}` : ''}`;
      
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          type: 'call_logged',
          channel: 'phone',
          description: generatedDescription,
          metadata: { action: actionValue, outcome, notes },
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Failed to log call activity'));

      showToast('Call logged successfully', 'success');

      setAdHocActivities((prev) => [{
        id: Date.now().toString(),
        type: 'call_logged',
        channel: 'phone',
        metadata: { action: actionValue, outcome, notes },
        createdAt: new Date().toISOString(),
        user: { firstName: '', lastName: '' },
      }, ...prev]);

      setShowDialer(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to log call activity', 'error');
    }
  };

  const handleArchive = async () => {
    if (!lead) return;
    if (!window.confirm(`Archive ${lead.firstName} ${lead.lastName}? They will be hidden from the pipeline.`)) return;
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      showToast('Lead archived', 'success');
      if (onLeadUpdate) onLeadUpdate({ ...lead, _archived: true });
      onClose();
    } else {
      showToast(await readApiError(res, 'Failed to archive lead'), 'error');
    }
  };

  const startEditProfile = () => {
    if (!lead) return;
    setProfileDraft({
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
      email: lead.email,
      phone: lead.phone ?? '',
      linkedIn: lead.linkedIn ?? '',
      whatsApp: lead.whatsApp ?? '',
    });
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!lead || !profileDraft) return;
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileDraft),
      });
      if (res.ok) {
        const updated = { ...lead, ...profileDraft };
        setLead(updated);
        if (onLeadUpdate) onLeadUpdate(updated);
        setEditingProfile(false);
        setProfileDraft(null);
        showToast('Profile saved', 'success');
      } else {
        showToast(await readApiError(res, 'Failed to save profile'), 'error');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleReassign = async (newUserId: string) => {
    if (!lead) return;
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToId: newUserId }),
    });
    if (res.ok) {
      const assignedUser = users.find((u) => u.id === newUserId) ?? null;
      const assignedTo = assignedUser
        ? { id: assignedUser.id, firstName: assignedUser.firstName, lastName: assignedUser.lastName }
        : null;
      setLead((prev) => (prev ? { ...prev, assignedTo } : prev));
      if (onLeadUpdate) onLeadUpdate({ ...lead, assignedTo });
      showToast('Lead reassigned', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to reassign lead'), 'error');
    }
  };

  const handleEnroll = (sequenceId: string) => {
    if (!lead) return;
    // If already in a different sequence, show confirmation modal
    if (lead.sequenceId && lead.sequenceId !== sequenceId) {
      const seq = sequences.find((s) => s.id === sequenceId);
      setEnrollConfirm({ sequenceId, sequenceName: seq?.name ?? 'this sequence' });
      return;
    }
    doEnroll(sequenceId);
  };

  const doEnroll = async (sequenceId: string) => {
    setEnrollConfirm(null);
    setEnrolling(sequenceId);
    const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id }),
    });
    setEnrolling(null);
    if (res.ok) {
      setLead((prev) => prev ? { ...prev, sequenceId, sequenceStep: 1, sequenceStatus: 'active', sequence: sequences.find((s) => s.id === sequenceId) ?? prev.sequence } : prev);
      showToast('Lead enrolled in sequence', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to enroll lead'), 'error');
    }
  };

  const handleUnenroll = async () => {
    if (!lead.sequenceId) return;
    setEnrolling('unenroll');
    const res = await fetch(`/api/sequences/${lead.sequenceId}/enroll`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id }),
    });
    setEnrolling(null);
    if (res.ok) {
      setLead((prev) => prev ? { ...prev, sequenceId: null, sequenceStep: null, sequenceStatus: null } : prev);
      showToast('Lead unenrolled from sequence', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to unenroll lead'), 'error');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim() || !newTask.dueDate) return;
    setSavingTask(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId: lead.id,
        type: newTask.type,
        title: newTask.title,
        description: '',
        dueDate: new Date(newTask.dueDate).toISOString(),
        priority: lead.priority === 'hot' ? 'high' : lead.priority === 'warm' ? 'medium' : 'low',
      }),
    });
    setSavingTask(false);
    if (res.ok) {
      const created = await res.json();
      setTasks((prev) => [...prev, created]);
      setNewTask({ type: 'email', title: '', dueDate: '' });
      setShowTaskForm(false);
      showToast('Task created!', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to create task'), 'error');
    }
  };

  const handleRunNow = async (taskId: string) => {
    setRunningTask(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/run-now`, { method: 'POST' });
      if (res.ok) {
        showToast('Task queued for immediate execution', 'success');
        setTasks((prev) => prev.map(t => t.id === taskId ? { ...t, dueDate: new Date().toISOString() } : t));
        if (onLeadUpdate && lead) onLeadUpdate({ ...lead });
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to run task', 'error');
      }
    } catch (e) {
      showToast('Error running task', 'error');
    } finally {
      setRunningTask(null);
    }
  };

  const stageLabels: Record<LeadDetail['stage'], string> = {
    new: 'New',
    sequence_active: 'Active Sequence',
    replied: 'Replied',
    meeting_booked: 'Meeting Booked',
    won: 'Won Deal',
    lost: 'Closed Lost',
  };

  const priorityColors = {
    hot: 'bg-brand-red/10 text-brand-red border-brand-red/20',
    warm: 'bg-brand-gold/10 text-brand-gold border-brand-gold/20',
    cold: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };

  const stageColors = {
    new: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
    sequence_active: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    replied: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
    meeting_booked: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    won: 'bg-green-600/15 text-green-500 border-green-600/30',
    lost: 'bg-brand-red/15 text-brand-red border-brand-red/30',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg h-full bg-card-bg border-l border-card-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/50">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${stageColors[lead.stage]}`}>
                {stageLabels[lead.stage]}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${priorityColors[lead.priority]}`}>
                {lead.priority} Priority
              </span>
            </div>
            <h2 className="font-display font-bold text-base text-text-primary mt-1.5 leading-tight">
              {lead.firstName} {lead.lastName}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {lead.title} at <span className="font-semibold">{lead.company}</span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleArchive}
              title="Archive lead"
              className="px-2.5 py-1.5 text-[10px] font-semibold text-text-muted hover:text-brand-red hover:bg-brand-red/5 border border-card-border hover:border-brand-red/30 rounded-lg transition-colors font-mono flex items-center gap-1"
            >
              Archive
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-card-border/40 text-text-muted hover:text-text-primary rounded-lg transition-colors ml-1"
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Sequence progress bar (only while the enrollment is active) */}
        {lead.sequenceStatus === 'active' && lead.sequence && (
          <div className="px-4 py-2.5 border-b border-card-border bg-blue-500/5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold font-mono text-blue-500 uppercase tracking-wide flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                {lead.sequence.name}
              </span>
              <span className="text-[10px] font-mono text-text-muted">
                Step {lead.sequenceStep ?? 1} of {lead.sequence.steps?.length ?? '?'}
              </span>
            </div>
            <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: lead.sequence.steps?.length
                    ? `${Math.min(100, ((lead.sequenceStep ?? 1) / lead.sequence.steps.length) * 100)}%`
                    : '0%',
                }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-card-border bg-background/20 px-2">
          {([
            { key: 'info' as const, label: 'Info', icon: null },
            { key: 'timeline' as const, label: 'Timeline Feed', icon: null },
            { key: 'tasks' as const, label: 'Tasks', icon: null },
            { key: 'sequences' as const, label: 'Sequences', icon: <Repeat className="w-3 h-3" /> },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-brand-red text-brand-red'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowComposer(true)}
                  aria-label={`Compose email to ${lead.firstName} ${lead.lastName}`}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/30 text-blue-500 transition-all text-center gap-1 focus-ring"
                >
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  <span className="text-[10px] font-medium font-mono">Email</span>
                </button>
                <button
                  type="button"
                  disabled={!lead.phone}
                  onClick={() => {
                    if (!lead.phone) return;
                    setShowDialer(true);
                  }}
                  title={lead.phone ? `Call ${lead.phone}` : 'No phone number'}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all text-center gap-1 ${
                    lead.phone
                      ? 'bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/30 text-emerald-500'
                      : 'bg-card-border/30 border border-transparent text-text-muted cursor-not-allowed opacity-50'
                  }`}
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-[10px] font-medium font-mono">Call</span>
                </button>
                <a
                  href={lead.linkedIn || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all text-center gap-1 ${
                    lead.linkedIn
                      ? 'bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 hover:border-indigo-500/30 text-indigo-500'
                      : 'bg-card-border/30 border border-transparent text-text-muted cursor-not-allowed opacity-50'
                  }`}
                >
                  <Linkedin className="w-4 h-4" />
                  <span className="text-[10px] font-medium font-mono">LinkedIn</span>
                </a>
                <a
                  href={lead.whatsApp ? `https://wa.me/${lead.whatsApp.replace(/[^0-9]/g, '')}` : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all text-center gap-1 ${
                    lead.whatsApp
                      ? 'bg-teal-500/5 hover:bg-teal-500/10 border border-teal-500/10 hover:border-teal-500/30 text-teal-500'
                      : 'bg-card-border/30 border border-transparent text-text-muted cursor-not-allowed opacity-50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-[10px] font-medium font-mono">WhatsApp</span>
                </a>
              </div>

              {lead.aiScore !== undefined && (
                <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono flex items-center gap-1.5">
                      AI Lead Score
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        lead.aiLabel === 'hot' ? 'bg-brand-red/10 text-brand-red border-brand-red/20' :
                        lead.aiLabel === 'warm' ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/20' :
                        'bg-blue-500/10 text-blue-500 border-blue-500/20'
                      }`}
                    >
                      {lead.aiScore}/100 · {lead.aiLabel}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 h-2 bg-card-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          lead.aiScore >= 60 ? 'bg-green-500' : lead.aiScore >= 35 ? 'bg-brand-gold' : 'bg-blue-500'
                        }`}
                        style={{ width: `${lead.aiScore}%` }}
                      />
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {lead.aiInsights?.map((insight, i) => (
                      <li key={i} className="text-[10px] text-text-secondary flex items-start gap-1.5">
                        <span className="text-brand-red mt-0.5">▸</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                  {lead.aiRecommendation && (
                    <p className="text-[10px] text-text-primary font-medium bg-brand-red/[0.04] border border-brand-red/10 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                      <span className="text-brand-red font-bold shrink-0">AI:</span>
                      {lead.aiRecommendation}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Prospect Profile</h3>
                  {!editingProfile ? (
                    <button onClick={startEditProfile} className="text-[10px] text-brand-red hover:text-brand-orange font-mono transition-colors">Edit</button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                        className="text-[10px] font-semibold text-white bg-brand-red hover:bg-brand-orange disabled:opacity-50 px-2 py-0.5 rounded font-mono transition-colors flex items-center gap-1"
                      >
                        {savingProfile && <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />}
                        Save
                      </button>
                      <button onClick={() => { setEditingProfile(false); setProfileDraft(null); }} className="text-[10px] text-text-muted hover:text-text-primary font-mono transition-colors">Cancel</button>
                    </div>
                  )}
                </div>
                {editingProfile && profileDraft ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {([
                      ['First Name', 'firstName'],
                      ['Last Name', 'lastName'],
                      ['Company', 'company'],
                      ['Title', 'title'],
                      ['Email', 'email'],
                      ['Phone', 'phone'],
                      ['LinkedIn URL', 'linkedIn'],
                      ['WhatsApp', 'whatsApp'],
                    ] as [string, keyof typeof profileDraft][]).map(([label, key]) => (
                      <div key={key} className={key === 'email' || key === 'linkedIn' ? 'col-span-2' : ''}>
                        <label className="text-text-muted block text-[10px] uppercase font-mono mb-1">{label}</label>
                        <input
                          type={key === 'email' ? 'email' : 'text'}
                          value={profileDraft[key]}
                          onChange={(e) => setProfileDraft((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                          className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">First / Last Name</span>
                      <span className="text-text-primary font-medium">{lead.firstName} {lead.lastName}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Title</span>
                      <span className="text-text-primary font-medium">{lead.title || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Direct Email</span>
                      <span className="text-text-primary font-medium select-all">{lead.email || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Phone Number</span>
                      <span className="text-text-primary font-medium">{lead.phone || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">WhatsApp</span>
                      <span className="text-text-primary font-medium">{lead.whatsApp || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Lead Source</span>
                      <span className="text-text-primary font-medium">{lead.source || '—'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Tags</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(lead.tags ?? []).map((tag) => (
                          <span key={tag} className="bg-card-border px-1.5 py-0.5 rounded text-[9px] text-text-secondary font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {(lead.emailValidation || lead.emailScore != null || lead.importListName || lead.contact || lead.account) && (
                <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3.5">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Enrichment Data</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Email Quality</span>
                      <span className="text-text-primary font-medium">
                        {lead.emailValidation || lead.contact?.emailValidation || 'N/A'}
                        {(lead.emailScore ?? lead.contact?.emailScore) !== undefined && (lead.emailScore ?? lead.contact?.emailScore) !== null
                          ? ` / ${lead.emailScore ?? lead.contact?.emailScore}`
                          : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Import List</span>
                      <span className="text-text-primary font-medium">{lead.importListName || lead.vendorSource || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Department</span>
                      <span className="text-text-primary font-medium">{lead.contact?.department || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Seniority</span>
                      <span className="text-text-primary font-medium">{lead.contact?.seniority || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Contact Country</span>
                      <span className="text-text-primary font-medium">{lead.contact?.country || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Industry</span>
                      <span className="text-text-primary font-medium">{lead.account?.industry || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Company Country</span>
                      <span className="text-text-primary font-medium">{lead.account?.country || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px] uppercase font-mono">Staff Range</span>
                      <span className="text-text-primary font-medium">{lead.account?.staffCountRange || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {lead.sequenceStatus === 'active' && lead.sequence && (
                <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Active Sequence</h3>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-brand-orange">{lead.sequence.name}</span>
                    <span className="text-text-muted font-mono text-[11px]">
                      Step {lead.sequenceStep ?? 1} of {lead.sequence.steps.length}
                    </span>
                  </div>
                  <div className="w-full bg-card-border h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-brand-red to-brand-orange h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${((lead.sequenceStep ?? 1) / (lead.sequence.steps.length || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Pipeline Control</h3>
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[10px] text-text-muted uppercase font-mono block mb-1">Pipeline Stage</label>
                    <select
                      value={lead.stage}
                      onChange={(e) => handleStageChange(e.target.value as LeadDetail['stage'])}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-medium"
                    >
                      <option value="new">New</option>
                      <option value="sequence_active">Sequence Active</option>
                      <option value="replied">Replied</option>
                      <option value="meeting_booked">Meeting Booked</option>
                      <option value="won">Won Deal</option>
                      <option value="lost">Closed Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted uppercase font-mono block mb-1">Priority Badge</label>
                    <select
                      value={lead.priority}
                      onChange={(e) => handlePriorityChange(e.target.value as LeadDetail['priority'])}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-medium"
                    >
                      <option value="hot">🔥 Hot</option>
                      <option value="warm">⚡ Warm</option>
                      <option value="cold">❄️ Cold</option>
                    </select>
                  </div>
                </div>
                {users.length > 0 && (
                  <div>
                    <label className="text-[10px] text-text-muted uppercase font-mono block mb-1">Assigned SDR</label>
                    <select
                      value={lead.assignedTo?.id ?? ''}
                      onChange={(e) => handleReassign(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-medium"
                    >
                      <option value="">— Unassigned —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName} ({u.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* REMINDERS SECTION */}
              <div className="bg-background/40 border border-card-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <AlarmClock className="w-3.5 h-3.5 text-brand-gold" aria-hidden="true" />
                    Reminders
                  </h3>
                  <button
                    onClick={() => setShowReminderForm((v) => !v)}
                    className="text-[10px] text-brand-red hover:text-brand-orange font-mono flex items-center gap-1 transition-colors"
                    aria-label="Add reminder"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    Add
                  </button>
                </div>

                {showReminderForm && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={newReminderText}
                      onChange={(e) => setNewReminderText(e.target.value)}
                      placeholder="Reminder note..."
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red"
                    />
                    <input
                      type="datetime-local"
                      value={newReminderDate}
                      onChange={(e) => setNewReminderDate(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddReminder}
                        disabled={savingReminder || !newReminderText.trim() || !newReminderDate}
                        className="flex-1 bg-brand-red hover:bg-brand-orange disabled:opacity-50 text-white text-xs font-semibold rounded-lg py-1.5 transition-colors flex items-center justify-center gap-1"
                      >
                        {savingReminder ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <Check className="w-3 h-3" aria-hidden="true" />}
                        Set Reminder
                      </button>
                      <button
                        onClick={() => { setShowReminderForm(false); setNewReminderText(''); setNewReminderDate(''); }}
                        className="px-3 text-xs text-text-muted hover:text-text-primary border border-card-border rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {reminders.length === 0 && !showReminderForm && (
                  <p className="text-[11px] text-text-muted font-mono">No active reminders for this lead.</p>
                )}

                {reminders.length > 0 && (
                  <ul className="space-y-1.5">
                    {reminders.map((r) => {
                      const isOverdue = new Date(r.dueAt) < new Date();
                      return (
                        <li key={r.id} className={`flex items-start gap-2 text-xs rounded-lg p-2 ${isOverdue ? 'bg-brand-gold/5 border border-brand-gold/20' : 'bg-background/60 border border-card-border'}`}>
                          <AlarmClock className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isOverdue ? 'text-brand-gold' : 'text-text-muted'}`} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className="text-text-secondary leading-snug">{r.text}</p>
                            <span className={`text-[9px] font-mono ${isOverdue ? 'text-brand-gold' : 'text-text-muted'}`}>
                              {isOverdue ? '⚠ overdue · ' : ''}
                              {new Date(r.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                              {new Date(r.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDismissReminderInPanel(r.id)}
                            className="text-text-muted hover:text-brand-red transition-colors flex-shrink-0"
                            aria-label="Dismiss reminder"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* LOG ACTIVITY */}
              <button
                onClick={() => { setShowLogActivity(true); setLogAction(''); setLogNote(''); setLogResponse(false); }}
                className="w-full py-2.5 border border-dashed border-card-border hover:border-brand-red/40 text-text-muted hover:text-brand-red rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Log Activity (ad-hoc)
              </button>
            </div>
          )}

          {/* TIMELINE TAB */}
          {activeTab === 'timeline' && (
            <div className="space-y-5">
              <form onSubmit={handleAddNote} className="space-y-2">
                <textarea
                  placeholder="Add a new note to this timeline..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full bg-background border border-card-border rounded-xl p-3 text-xs text-text-primary focus:outline-none focus:border-brand-red h-20 placeholder-text-muted resize-none leading-relaxed"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Note</span>
                  </button>
                </div>
              </form>

              {timelineItems.length === 0 ? (
                <div className="text-center p-6 border border-dashed border-card-border rounded-xl text-xs text-text-muted">
                  No timeline actions recorded.
                </div>
              ) : (
                <div className="relative pl-6 border-l border-card-border ml-3.5 space-y-5 mt-4">
                  {timelineItems.map((item) => {
                    const markerColor =
                      item.type === 'note'
                        ? item.isPinned
                          ? 'bg-brand-gold ring-4 ring-brand-gold/10 text-brand-dark'
                          : 'bg-blue-500 text-white'
                        : item.type === 'task_completed'
                        ? 'bg-green-500 text-white'
                        : item.type === 'task_skipped'
                        ? 'bg-card-border text-text-muted'
                        : item.type === 'activity'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-brand-orange text-white';

                    const icon =
                      item.type === 'note'
                        ? '📝'
                        : item.type === 'task_completed'
                        ? '✓'
                        : item.type === 'task_skipped'
                        ? '⏭'
                        : item.type === 'activity'
                        ? '⚡'
                        : '⏳';

                    return (
                      <div key={item.id} className="relative group">
                        <div
                          className={`absolute -left-[34px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm border-2 border-card-bg ${markerColor}`}
                        >
                          {icon}
                        </div>
                        <div
                          className={`p-3.5 border rounded-xl bg-card-bg/60 hover:bg-card-bg transition-all ${
                            item.isPinned
                              ? 'border-brand-gold/40 shadow-sm shadow-brand-gold/5'
                              : 'border-card-border hover:border-text-secondary/40'
                          }`}
                        >
                          {item.type === 'note' && (
                            <button
                              onClick={() => handleTogglePin(item.id)}
                              className={`absolute right-3.5 top-3.5 transition-colors ${
                                item.isPinned ? 'text-brand-gold' : 'text-text-muted hover:text-text-secondary'
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" fill={item.isPinned ? 'currentColor' : 'none'} />
                            </button>
                          )}
                          <div className="flex items-center justify-between mb-1.5 pr-5">
                            <span className="font-semibold text-text-primary text-[11px] leading-tight">
                              {item.title}
                            </span>
                            <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">
                              {new Date(item.date).toLocaleDateString()}{' '}
                              {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider font-mono">Tasks</h3>
                <button
                  onClick={() => setShowTaskForm((v) => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-brand-red hover:bg-brand-red-hover text-white text-[10px] font-semibold rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Task</span>
                </button>
              </div>

              {showTaskForm && (
                <form onSubmit={handleCreateTask} className="bg-background/60 border border-brand-red/20 rounded-xl p-3.5 space-y-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-mono text-text-muted uppercase mb-1">Channel</label>
                      <select
                        value={newTask.type}
                        onChange={(e) => setNewTask((p) => ({ ...p, type: e.target.value as TaskItem['type'] }))}
                        className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red text-xs"
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-mono text-text-muted uppercase mb-1">Due Date</label>
                      <input
                        type="datetime-local"
                        required
                        value={newTask.dueDate}
                        onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
                        className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red text-xs"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Task title, e.g. Send intro email"
                    value={newTask.title}
                    onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                    className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red text-xs"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowTaskForm(false)} className="px-2.5 py-1 border border-card-border rounded-lg text-text-secondary text-[10px] font-semibold hover:bg-card-border/30 transition-colors">Cancel</button>
                    <button type="submit" disabled={savingTask} className="px-2.5 py-1 bg-brand-red hover:bg-brand-red-hover text-white rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-60">
                      {savingTask ? 'Saving...' : 'Create Task'}
                    </button>
                  </div>
                </form>
              )}

              {tasks.length === 0 && !showTaskForm ? (
                <div className="text-center p-6 border border-dashed border-card-border rounded-xl text-xs text-text-muted">
                  No tasks yet. Click "Add Task" to schedule an outreach action.
                </div>
              ) : tasks.length === 0 ? null : (
                <div className="space-y-2.5">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3 border rounded-xl flex items-center justify-between gap-3 text-xs bg-background/10 ${
                        task.status === 'completed'
                          ? 'border-green-600/20 opacity-80'
                          : task.status === 'skipped'
                          ? 'border-card-border opacity-60'
                          : 'border-card-border'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base flex-shrink-0">
                          {task.type === 'email'
                            ? '📧'
                            : task.type === 'phone'
                            ? '📞'
                            : task.type === 'linkedin'
                            ? '💼'
                            : '💬'}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`font-semibold truncate ${
                              task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="text-[10px] text-text-muted font-mono mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                            {task.sequenceStep && <span>· Step {task.sequenceStep}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {task.status === 'pending' && task.type === 'email' && task.sequenceStep != null && (
                          <button
                            onClick={() => handleRunNow(task.id)}
                            disabled={runningTask === task.id}
                            className="px-2 py-0.5 bg-brand-red hover:bg-brand-red-hover text-white text-[9px] font-bold rounded shadow-sm transition-colors disabled:opacity-60 font-mono flex items-center gap-1"
                          >
                            {runningTask === task.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : null}
                            RUN NOW
                          </button>
                        )}
                        {task.status === 'completed' ? (
                          <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20 rounded font-mono">
                            ✓ DONE
                          </span>
                        ) : task.status === 'skipped' ? (
                          <span className="px-2 py-0.5 bg-card-border text-text-muted text-[9px] font-bold rounded font-mono">
                            ⏭ SKIPPED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-brand-orange/10 text-brand-orange text-[9px] font-bold border border-brand-orange/20 rounded font-mono">
                            PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SEQUENCES TAB */}
          {activeTab === 'sequences' && (
            <div className="space-y-4">
              {/* Active sequence */}
              {lead.sequenceStatus === 'active' && lead.sequence ? (
                <div className="glass-card rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Active Sequence</p>
                      <p className="text-sm font-bold text-text-primary mt-0.5">{lead.sequence.name}</p>
                    </div>
                    <button
                      onClick={handleUnenroll}
                      disabled={enrolling === 'unenroll'}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-brand-red border border-brand-red/30 rounded-lg hover:bg-brand-red/10 transition-colors disabled:opacity-50"
                    >
                      {enrolling === 'unenroll' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      Unenroll
                    </button>
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-text-muted mb-1">
                      <span>Step {lead.sequenceStep ?? 1} of {lead.sequence.steps?.length ?? '—'}</span>
                      <span>{lead.sequence.steps?.length ? Math.round(((lead.sequenceStep ?? 1) / lead.sequence.steps.length) * 100) : 0}%</span>
                    </div>
                    <div className="h-1.5 bg-card-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-red rounded-full transition-all"
                        style={{ width: `${lead.sequence.steps?.length ? Math.min(100, ((lead.sequenceStep ?? 1) / lead.sequence.steps.length) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-background/30 border border-card-border text-xs text-text-muted">
                  <Repeat className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span>No active sequence. Enroll below.</span>
                </div>
              )}

              {/* Enrollment History */}
              {(lead as any).sequenceEnrollments && ((lead as any).sequenceEnrollments as any[]).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider mb-2">
                    Enrollment History
                  </h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1 mb-4">
                    {((lead as any).sequenceEnrollments as any[]).map((enr) => (
                      <div key={enr.id} className="flex justify-between items-center p-2.5 bg-background/30 border border-card-border rounded-xl text-xs font-sans">
                        <div>
                          <p className="font-semibold text-text-primary">{enr.sequence?.name || 'Unknown Sequence'}</p>
                          <p className="text-[9px] text-text-muted font-mono mt-0.5">
                            Started: {new Date(enr.startedAt).toLocaleDateString()}{' '}
                            {enr.completedAt ? `· Ended: ${new Date(enr.completedAt).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border font-mono capitalize ${
                          enr.status === 'active'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : enr.status === 'paused'
                            ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/20'
                            : enr.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-card-border text-text-muted'
                        }`}>
                          {enr.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available sequences */}
              <div>
                <h3 className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider mb-2">
                  {lead.sequenceStatus === 'active' ? 'Switch Sequence' : 'Available Sequences'}
                </h3>
                {sequences.length === 0 ? (
                  <p className="text-xs text-text-muted">No sequences found.</p>
                ) : (
                  <div className="space-y-2">
                    {sequences
                      .filter((s) => s.id !== lead.sequenceId)
                      .map((seq) => (
                        <div key={seq.id} className="flex items-center justify-between p-3 glass-card rounded-xl">
                          <div>
                            <p className="text-xs font-semibold text-text-primary">{seq.name}</p>
                            <p className="text-[10px] text-text-muted font-mono">{seq.steps?.length ?? 0} steps</p>
                          </div>
                          <button
                            onClick={() => handleEnroll(seq.id)}
                            disabled={enrolling === seq.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold bg-brand-red/10 text-brand-red border border-brand-red/30 rounded-lg hover:bg-brand-red/20 transition-colors disabled:opacity-50"
                          >
                            {enrolling === seq.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Repeat className="w-3 h-3" aria-hidden="true" />
                            )}
                            {lead.sequenceId ? 'Switch' : 'Enroll'}
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Activity modal */}
      {showLogActivity && lead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowLogActivity(false)} />
          <form
            onSubmit={handleLogActivitySubmit}
            className="relative glass-card rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl space-y-4"
            role="dialog" aria-modal="true" aria-label="Log activity"
          >
            <div>
              <h3 className="font-display font-bold text-sm text-text-primary">Log Activity</h3>
              <p className="text-[11px] text-text-muted mt-0.5 font-mono">{lead.firstName} {lead.lastName} · {lead.company}</p>
            </div>

            {/* Channel picker */}
            <div className="flex gap-1.5">
              {(['email', 'phone', 'linkedin', 'whatsapp'] as const).map((ch) => {
                const icons: Record<string, string> = { email: '📧', phone: '📞', linkedin: '💼', whatsapp: '💬' };
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => { setLogChannel(ch); setLogAction(''); }}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold font-mono capitalize transition-all ${logChannel === ch ? 'bg-brand-red text-white' : 'bg-card-border text-text-muted hover:text-text-primary'}`}
                  >
                    {icons[ch]}<br/>{ch}
                  </button>
                );
              })}
            </div>

            {/* Action type */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Action <span className="text-brand-red">*</span></label>
              <select
                value={logAction}
                onChange={(e) => setLogAction(e.target.value)}
                required
                className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
              >
                <option value="">— Select —</option>
                {logChannel === 'phone' && <>
                  <option value="no_answer">No Answer</option>
                  <option value="voicemail_left">Voicemail Left</option>
                  <option value="voicemail_not_left">Went to Voicemail — No Message</option>
                  <option value="connected_interested">Connected — Interested</option>
                  <option value="connected_not_interested">Connected — Not Interested</option>
                  <option value="connected_meeting_booked">Connected — Meeting Booked</option>
                  <option value="callback_requested">Callback Requested</option>
                  <option value="wrong_number">Wrong Number</option>
                  <option value="do_not_call">Do Not Call</option>
                </>}
                {logChannel === 'email' && <>
                  <option value="cold_outreach">Cold Outreach Sent</option>
                  <option value="follow_up">Follow-up Sent</option>
                  <option value="break_up">Break-up Email Sent</option>
                  <option value="reply_received">Reply Received</option>
                </>}
                {logChannel === 'linkedin' && <>
                  <option value="connection_request">Connection Request Sent</option>
                  <option value="inmail">InMail Sent</option>
                  <option value="follow_up_message">Follow-up Message</option>
                  <option value="commented_on_post">Commented on Post</option>
                  <option value="voice_note">Voice Note</option>
                  <option value="profile_view_bait">Profile View (Bait)</option>
                </>}
                {logChannel === 'whatsapp' && <>
                  <option value="first_message">First Message</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="voice_note">Voice Note</option>
                  <option value="document_sent">Document / Deck Sent</option>
                  <option value="video_message">Video Message</option>
                </>}
              </select>
            </div>

            {/* Response toggle (non-phone) */}
            {logChannel !== 'phone' && logChannel !== 'email' && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLogResponse((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${logResponse ? 'bg-emerald-500' : 'bg-card-border'}`}
                  aria-pressed={logResponse}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${logResponse ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                </button>
                <span className="text-xs text-text-secondary cursor-pointer" onClick={() => setLogResponse((v) => !v)}>Response received</span>
              </div>
            )}

            {/* Notes */}
            <textarea
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              placeholder="Notes (optional)..."
              className="w-full bg-background border border-card-border rounded-lg p-2.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red h-16 resize-none"
            />

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowLogActivity(false)} className="flex-1 py-2 text-xs font-semibold text-text-muted border border-card-border rounded-lg hover:text-text-primary transition-colors">Cancel</button>
              <button type="submit" disabled={savingLog || !logAction} className="flex-1 py-2 text-xs font-bold text-white bg-brand-red hover:bg-brand-orange disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                {savingLog && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                Log Activity
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Re-enrollment confirmation modal */}
      {enrollConfirm && lead && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEnrollConfirm(null)} />
          <div className="relative glass-card rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl space-y-4" role="dialog" aria-modal="true" aria-label="Confirm sequence switch">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="font-display font-bold text-sm text-text-primary">Switch Sequence?</h3>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  <span className="font-semibold text-text-primary">{lead.firstName} {lead.lastName}</span> is currently on{' '}
                  <span className="text-brand-orange font-semibold">
                    {lead.sequence?.name ?? 'a sequence'}
                  </span>{' '}
                  at step{' '}
                  <span className="font-mono font-bold text-text-primary">
                    {lead.sequenceStep ?? 1} of {lead.sequence?.steps.length ?? '?'}
                  </span>.
                </p>
                <p className="text-xs text-text-secondary mt-2 leading-relaxed">
                  Switching to <span className="font-semibold text-brand-red">{enrollConfirm.sequenceName}</span> will unenroll them from the current sequence. All pending steps on the old sequence will be skipped.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => setEnrollConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary border border-card-border rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doEnroll(enrollConfirm.sequenceId)}
                className="px-4 py-2 text-xs font-bold text-white bg-brand-red hover:bg-brand-orange rounded-lg shadow-sm transition-colors"
              >
                Yes, Switch Sequence
              </button>
            </div>
          </div>
        </div>
      )}

      {showComposer && lead && (
        <MailComposerModal
          lead={{
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company,
            title: lead.title ?? '',
            email: lead.email,
            phone: lead.phone ?? undefined,
            sequenceId: lead.sequenceId ?? undefined,
            sequenceStep: lead.sequenceStep ?? undefined,
          }}
          onClose={() => setShowComposer(false)}
          onSent={() => {
            showToast('Email sent', 'success');
            if (leadId) {
              fetch(`/api/leads/${leadId}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => { if (data) setLead(data); })
                .catch(() => {});
            }
          }}
        />
      )}

      {showDialer && lead && (
        <CallDialerModal
          lead={{
            id: lead.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company,
            phone: lead.phone ?? undefined,
          }}
          onClose={() => setShowDialer(false)}
          onHangUp={handleDialerHangUp}
        />
      )}
    </div>
  );
}
