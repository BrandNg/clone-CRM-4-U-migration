import React, { useState, useEffect, useCallback } from 'react';
import { Target, CheckCircle2, RefreshCw, BarChart2, Inbox } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface MemberStats {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  sourcedCount: number;
  assignedCount: number;
  qualifiedCount: number;
  campaigns: string[];
}

export default function LeadgenTeamProgress() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<MemberStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leadgen/team-progress');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      showToast('Failed to load team progress metrics', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-row items-center justify-between gap-4 bg-card-bg border border-card-border p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <span className="text-[10px] font-bold font-mono text-brand-orange uppercase tracking-wider">
              Leadgen Team Performance
            </span>
            <h2 className="font-display font-extrabold text-sm text-text-primary leading-tight">
              Representative Leaderboards & Metrics
            </h2>
          </div>
        </div>

        <button
          onClick={fetchStats}
          className="w-auto flex items-center justify-center gap-2 bg-background border border-card-border hover:bg-card-border/30 rounded-xl px-4 py-2 text-xs font-semibold text-text-primary transition-all active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stats</span>
        </button>
      </div>

      {loading && stats.length === 0 ? (
        <div className="flex items-center justify-center py-20 bg-card-bg border border-card-border rounded-2xl">
          <div className="w-8 h-8 border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin" />
        </div>
      ) : stats.length === 0 ? (
        <div className="bg-card-bg border border-card-border p-12 rounded-2xl text-center text-xs text-text-muted font-semibold">
          No team members report to you or no metrics available.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Visual Cards per Member */}
          <div className="grid grid-cols-2 gap-6">
            {stats.map((member) => {
              const conversionRate = member.assignedCount > 0 
                ? Math.round((member.qualifiedCount / member.assignedCount) * 100)
                : 0;

              return (
                <div
                  key={member.id}
                  className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm hover-lift flex flex-col justify-between space-y-4"
                >
                  {/* User Profile Header */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-sidebar-border border border-sidebar-border flex items-center justify-center font-bold text-xs text-brand-orange uppercase flex-shrink-0">
                      {member.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <h3 className="font-display font-extrabold text-sm text-text-primary leading-tight">
                        {member.name}
                      </h3>
                      <p className="text-[10px] text-text-muted font-mono mt-0.5">{member.email}</p>
                    </div>
                  </div>

                  {/* Campaigns Coverage */}
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-bold font-mono text-text-muted uppercase">Assigned Campaigns:</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {member.campaigns.length === 0 ? (
                        <span className="text-[10px] text-text-muted italic">No campaigns assigned</span>
                      ) : (
                        member.campaigns.map((camp) => (
                          <span
                            key={camp}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-background border border-card-border text-text-secondary"
                          >
                            {camp}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Metric Summary Grid */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-2">
                    <div className="bg-background border border-card-border rounded-xl p-2.5">
                      <Inbox className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                      <p className="font-display font-extrabold text-sm text-text-primary">{member.sourcedCount}</p>
                      <span className="text-[8px] uppercase font-mono text-text-muted block mt-0.5">Sourced</span>
                    </div>

                    <div className="bg-background border border-card-border rounded-xl p-2.5">
                      <Target className="w-4 h-4 text-brand-orange mx-auto mb-1" />
                      <p className="font-display font-extrabold text-sm text-text-primary">{member.assignedCount}</p>
                      <span className="text-[8px] uppercase font-mono text-text-muted block mt-0.5">Active Pip</span>
                    </div>

                    <div className="bg-background border border-card-border rounded-xl p-2.5">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
                      <p className="font-display font-extrabold text-sm text-text-primary">{member.qualifiedCount}</p>
                      <span className="text-[8px] uppercase font-mono text-text-muted block mt-0.5">Meetings</span>
                    </div>
                  </div>

                  {/* Conversion Meter */}
                  <div className="space-y-1 pt-2 border-t border-card-border/50">
                    <div className="flex justify-between items-center text-[10px] font-mono font-semibold text-text-muted">
                      <span>Pipeline Qualification Rate:</span>
                      <span className="font-bold text-brand-orange">{conversionRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-background border border-card-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${conversionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
