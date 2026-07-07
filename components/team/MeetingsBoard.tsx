import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, CheckCircle2, XCircle, RefreshCw, Star, ArrowUpRight } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  stage: 'meeting_booked' | 'won' | 'lost' | string;
  assignedTo: {
    id: string;
    firstName: string;
    lastName: string;
  };
  campaign: {
    id: string;
    name: string;
    client: {
      name: string;
    };
  };
  activities: {
    createdAt: string;
  }[];
}

interface MeetingsBoardProps {
  onSelectLead: (id: string) => void;
}

export default function MeetingsBoard({ onSelectLead }: MeetingsBoardProps) {
  const { showToast } = useToast();
  const [meetings, setMeetings] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStage, setFilterStage] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch {
      showToast('Failed to load meetings data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleUpdateStage = async (leadId: string, newStage: 'won' | 'lost' | 'sequence_active') => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
      if (res.ok) {
        showToast(
          `Lead outcome successfully updated to ${
            newStage === 'won' ? 'Won' : newStage === 'lost' ? 'Lost' : 'Active'
          }`,
          'success'
        );
        fetchMeetings(); // Refresh the list
      } else {
        showToast('Failed to update lead outcome', 'error');
      }
    } catch {
      showToast('Error updating lead outcome', 'error');
    }
  };

  // KPI calculations
  const totalBooked = meetings.length;
  const wonCount = meetings.filter((m) => m.stage === 'won').length;
  const lostCount = meetings.filter((m) => m.stage === 'lost').length;
  const winRate = totalBooked > 0 ? Math.round((wonCount / totalBooked) * 100) : 0;

  // Filter & Search logic
  const filteredMeetings = meetings.filter((m) => {
    const matchesStage =
      filterStage === 'all' ||
      (filterStage === 'scheduled' && m.stage === 'meeting_booked') ||
      (filterStage === 'won' && m.stage === 'won') ||
      (filterStage === 'lost' && m.stage === 'lost');

    const fullName = `${m.firstName} ${m.lastName} ${m.company} ${m.assignedTo?.firstName} ${m.assignedTo?.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(searchQuery.toLowerCase());

    return matchesStage && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card-bg border border-card-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Total Booked</span>
            <p className="font-display font-extrabold text-2xl text-text-primary mt-1">{totalBooked}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card-bg border border-card-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Won / Closed</span>
            <p className="font-display font-extrabold text-2xl text-green-500 mt-1">{wonCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card-bg border border-card-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Lost / No-Show</span>
            <p className="font-display font-extrabold text-2xl text-brand-red mt-1">{lostCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-red/10 border border-brand-red/20 flex items-center justify-center text-brand-red">
            <XCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card-bg border border-card-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold font-mono text-text-muted uppercase tracking-wider">Win Rate</span>
            <p className="font-display font-extrabold text-2xl text-brand-orange mt-1">{winRate}%</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center text-brand-orange">
            <Star className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Table Actions Control */}
      <div className="flex flex-row items-center justify-between gap-4 bg-card-bg border border-card-border p-4 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-auto">
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red placeholder-text-muted w-60 font-semibold"
          />
          <div className="flex bg-background border border-card-border rounded-lg p-0.5 gap-0.5 w-auto">
            {['all', 'scheduled', 'won', 'lost'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStage(st)}
                className={`px-3 py-1 rounded text-[10px] font-bold capitalize transition-all ${
                  filterStage === st
                    ? 'bg-brand-red text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {st === 'scheduled' ? 'Scheduled' : st}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchMeetings}
          className="w-auto flex items-center justify-center gap-2 bg-background border border-card-border hover:bg-card-border/30 rounded-xl px-4 py-2 text-xs font-semibold text-text-primary transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Board</span>
        </button>
      </div>

      {/* Board Listing */}
      {loading && meetings.length === 0 ? (
        <div className="flex items-center justify-center py-20 bg-card-bg border border-card-border rounded-2xl">
          <div className="w-8 h-8 border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin" />
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="bg-card-bg border border-card-border p-12 rounded-2xl text-center text-xs text-text-muted font-semibold">
          No booked meetings matched the filters.
        </div>
      ) : (
        <div className="bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-card-border bg-background/50 font-mono text-[10px] font-bold text-text-muted uppercase">
                  <th className="p-4">Lead / Company</th>
                  <th className="p-4">Campaign</th>
                  <th className="p-4">Booked By (SDR)</th>
                  <th className="p-4">Booking Date</th>
                  <th className="p-4">Outcome Status</th>
                  <th className="p-4 text-right">Log Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {filteredMeetings.map((m) => {
                  const bookingDate = m.activities?.[0]?.createdAt
                    ? new Date(m.activities[0].createdAt).toLocaleString()
                    : 'N/A';

                  return (
                    <tr key={m.id} className="hover:bg-card-border/10 transition-colors">
                      <td className="p-4">
                        <button
                          onClick={() => onSelectLead(m.id)}
                          className="flex items-center gap-1.5 font-bold text-text-primary hover:text-brand-red text-left group"
                        >
                          <span>{m.firstName} {m.lastName}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <p className="text-[10px] text-text-muted mt-0.5">{m.company}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-text-secondary">{m.campaign?.name}</p>
                        <p className="text-[10px] text-text-muted">{m.campaign?.client?.name}</p>
                      </td>
                      <td className="p-4 font-medium text-text-primary">
                        {m.assignedTo?.firstName} {m.assignedTo?.lastName}
                      </td>
                      <td className="p-4 font-mono text-text-secondary">{bookingDate}</td>
                      <td className="p-4">
                        {m.stage === 'won' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20 uppercase tracking-wide">
                            Won
                          </span>
                        ) : m.stage === 'lost' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-red/10 text-brand-red border border-brand-red/20 uppercase tracking-wide">
                            Lost
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase tracking-wide">
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {m.stage === 'meeting_booked' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateStage(m.id, 'won')}
                              className="bg-green-500 hover:bg-green-600 text-white font-bold px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                            >
                              Won / Closed
                            </button>
                            <button
                              onClick={() => handleUpdateStage(m.id, 'lost')}
                              className="bg-brand-red hover:bg-brand-red/90 text-white font-bold px-2.5 py-1.5 rounded-lg transition-colors shadow-sm"
                            >
                              Lost
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleUpdateStage(m.id, 'sequence_active')}
                            className="bg-background border border-card-border hover:bg-card-border/30 text-text-secondary font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                          >
                            Reschedule
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
