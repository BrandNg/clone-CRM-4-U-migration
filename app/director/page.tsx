'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarCheck, ClipboardList, BarChart3, Users, ArrowRight, Clock } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import MeetingsBoard from '@/components/team/MeetingsBoard';

const LeadDetailPanel = dynamic(() => import('@/components/LeadDetailPanel'), { ssr: false });

interface DirectorTask {
  id: string;
  title: string;
  type: string;
  status: string;
  dueDate: string | null;
  userId: string;
  lead?: { id: string; firstName: string; lastName: string | null; company: string | null } | null;
}

function dueLabel(due: string | null): { text: string; overdue: boolean } {
  if (!due) return { text: 'No date', overdue: false };
  const d = new Date(due);
  const now = new Date();
  const overdue = d.getTime() < now.getTime();
  const text = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { text, overdue };
}

export default function DirectorPage() {
  const { currentRole, currentUserId, isSessionLoading } = useAppContext();
  const router = useRouter();

  // Closing cockpit is Director-only. Send anyone else back to their dashboard.
  useEffect(() => {
    if (!isSessionLoading && currentRole && currentRole !== 'director') {
      router.replace('/');
    }
  }, [isSessionLoading, currentRole, router]);

  const [tasks, setTasks] = useState<DirectorTask[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tasks')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTasks(Array.isArray(data) ? data : (data.tasks ?? data.data ?? [])))
      .catch(() => setTasks([]));
  }, []);

  // The Director's own prep / follow-up tasks (his, still open), soonest first.
  const myTasks = useMemo(() => {
    return tasks
      .filter((t) => t.userId === currentUserId && t.status === 'pending')
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      .slice(0, 8);
  }, [tasks, currentUserId]);

  if (currentRole && currentRole !== 'director') return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-hero flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary">Director Cockpit</h1>
          <p className="text-sm text-text-muted mt-0.5">
            The meetings your SDRs booked for you to close — plus your prep, follow-ups, and org oversight.
          </p>
        </div>
        <div className="flex items-center gap-2 self-auto">
          <Link
            href="/team"
            className="flex items-center gap-1.5 px-3 py-2 bg-card-bg hover:bg-card-border/40 border border-card-border text-text-secondary text-xs font-semibold rounded-lg transition-colors"
          >
            <BarChart3 className="w-4 h-4" /> Team Performance Hub
          </Link>
        </div>
      </div>

      {/* My prep / follow-up tasks */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
          <h2 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-brand-orange" />
            <span>My Tasks — Prep &amp; Follow-ups</span>
          </h2>
          <Link href="/" className="text-[11px] font-semibold text-brand-orange hover:underline flex items-center gap-1">
            Full task dashboard <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {myTasks.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-muted">🎉 No open tasks — you&apos;re clear.</p>
        ) : (
          <ul className="divide-y divide-card-border">
            {myTasks.map((t) => {
              const due = dueLabel(t.dueDate);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-background/40">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{t.title}</p>
                    {t.lead && (
                      <button
                        onClick={() => setSelectedLeadId(t.lead!.id)}
                        className="text-xs text-text-muted hover:text-brand-orange truncate"
                      >
                        {t.lead.firstName} {t.lead.lastName ?? ''}
                        {t.lead.company ? ` · ${t.lead.company}` : ''}
                      </button>
                    )}
                  </div>
                  <span
                    className={`flex items-center gap-1 text-[11px] font-mono whitespace-nowrap ${
                      due.overdue ? 'text-brand-red' : 'text-text-muted'
                    }`}
                  >
                    <Clock className="w-3 h-3" /> {due.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Meetings cockpit — the leads SDRs booked for him to close */}
      <div>
        <h2 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2 mb-3">
          <CalendarCheck className="w-5 h-5 text-brand-red" />
          <span>Meetings to Close</span>
        </h2>
        <MeetingsBoard onSelectLead={setSelectedLeadId} />
      </div>

      {/* Oversight quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/team"
          className="glass-card rounded-2xl p-5 hover-lift flex items-center justify-between group"
        >
          <div>
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-orange" /> Floor → Team → SDR
            </h3>
            <p className="text-xs text-text-muted mt-1">Campaigns, performance, rep progress, and meetings org-wide.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-brand-orange transition-colors" />
        </Link>
        <Link
          href="/leads"
          className="glass-card rounded-2xl p-5 hover-lift flex items-center justify-between group"
        >
          <div>
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-orange" /> All Leads
            </h3>
            <p className="text-xs text-text-muted mt-1">The full org-wide pipeline — every account and stage.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-text-muted group-hover:text-brand-orange transition-colors" />
        </Link>
      </div>

      {selectedLeadId && (
        <LeadDetailPanel leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      )}
    </div>
  );
}
