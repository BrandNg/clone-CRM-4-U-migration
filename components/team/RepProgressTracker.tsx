import React, { useState, useEffect } from 'react';
import { Award, CheckCircle, TrendingUp, Clock } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface RepProgressTrackerProps {
  users: User[];
  dateRange: 'today' | 'week' | 'month';
}

export default function RepProgressTracker({ users, dateRange }: RepProgressTrackerProps) {
  const { showToast } = useToast();
  const [selectedSdrId, setSelectedSdrId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<{
    stageCounts: Record<string, number>;
    taskProgress: { completed: number; skipped: number; pending: number; overdue: number };
    recentOutcomes: { id: string; type: string; description: string; createdAt: string }[];
  } | null>(null);

  // Filter to show only SDR role users
  const sdrs = users.filter((u) => u.role === 'sdr');

  // Auto-select first SDR when list loads
  useEffect(() => {
    if (sdrs.length > 0 && !selectedSdrId) {
      setSelectedSdrId(sdrs[0].id);
    }
  }, [sdrs, selectedSdrId]);

  // Fetch SDR progress data when sdr or dateRange changes
  useEffect(() => {
    if (!selectedSdrId) return;

    setLoading(true);
    fetch(`/api/team/sdr-progress?sdrId=${selectedSdrId}&dateRange=${dateRange}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((resData) => {
        setData(resData);
      })
      .catch(() => {
        showToast('Failed to load SDR progress data', 'error');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [selectedSdrId, dateRange, showToast]);

  if (sdrs.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-xs text-text-muted">
        No SDRs assigned to your team to track.
      </div>
    );
  }

  const selectedSdr = sdrs.find((u) => u.id === selectedSdrId);

  // Funnel chart calculation
  const stageCounts = data?.stageCounts ?? { new: 0, sequence_active: 0, replied: 0, meeting_booked: 0, won: 0, lost: 0 };
  const funnelData = [
    { stage: 'New', count: stageCounts.new ?? 0, fill: '#9CA3AF' },
    { stage: 'Sequence Active', count: stageCounts.sequence_active ?? 0, fill: '#3B82F6' },
    { stage: 'Replied', count: stageCounts.replied ?? 0, fill: '#E8611A' },
    { stage: 'Meeting Booked', count: stageCounts.meeting_booked ?? 0, fill: '#10B981' },
    { stage: 'Won', count: stageCounts.won ?? 0, fill: '#22C55E' },
    { stage: 'Lost', count: stageCounts.lost ?? 0, fill: '#D42B1E' },
  ];

  const getConvRate = (num: number, den: number) => {
    if (!den) return 0;
    return Math.round((num / den) * 100);
  };

  const totalLeads = Object.values(stageCounts).reduce((a, b) => a + b, 0) || 1;

  const taskProgress = data?.taskProgress ?? { completed: 0, skipped: 0, pending: 0, overdue: 0 };
  const totalTasks = taskProgress.completed + taskProgress.skipped + taskProgress.pending;

  return (
    <div className="space-y-6">
      {/* Selector Hub */}
      <div className="flex flex-row items-center justify-between gap-4 bg-card-bg border border-card-border p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-red/10 border border-brand-red/20 flex items-center justify-center">
            <Award className="w-4 h-4 text-brand-red" />
          </div>
          <div>
            <span className="text-[10px] font-bold font-mono text-brand-orange uppercase tracking-wider">
              Individual Progress Tracker
            </span>
            <h2 className="font-display font-extrabold text-sm text-text-primary leading-tight">
              {selectedSdr ? `${selectedSdr.firstName} ${selectedSdr.lastName}` : 'Select an SDR'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold font-mono text-text-muted uppercase">Select Representative:</span>
          <select
            value={selectedSdrId}
            onChange={(e) => setSelectedSdrId(e.target.value)}
            className="bg-background border border-card-border rounded-xl text-xs font-semibold px-3 py-1.5 text-text-primary focus:outline-none focus:border-brand-red cursor-pointer"
          >
            {sdrs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-red/30 border-t-brand-red rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="glass-card rounded-2xl p-8 text-center text-xs text-text-muted">
          Select an SDR to load performance analytics.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Funnel Metrics Card */}
          <div className="col-span-2 glass-card rounded-2xl p-5 hover-lift space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-brand-orange" />
                <span>Conversion Pipeline Funnel</span>
              </h3>
              <span className="text-[10px] font-mono text-text-muted">Leads distribution</span>
            </div>
            
            <div className="flex flex-row gap-6 items-center">
              <div className="w-2/3">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    layout="vertical"
                    data={funnelData}
                    margin={{ top: 5, right: 10, left: 20, bottom: 5 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="stage"
                      type="category"
                      tick={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--card-border)',
                        borderRadius: 8,
                        fontSize: 10,
                      }}
                      cursor={{ fill: 'rgba(128,128,128,0.03)' }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={10}>
                      {funnelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Conversion ratios */}
              <div className="w-1/3 bg-background/40 border border-card-border p-4 rounded-xl space-y-2.5">
                <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase">Stage Conversion</h4>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'New → Active', rate: getConvRate(stageCounts.sequence_active ?? 0, stageCounts.new ?? 0) },
                    { label: 'Active → Replied', rate: getConvRate(stageCounts.replied ?? 0, stageCounts.sequence_active ?? 0) },
                    { label: 'Replied → Booked', rate: getConvRate(stageCounts.meeting_booked ?? 0, stageCounts.replied ?? 0) },
                    { label: 'Booked → Won', rate: getConvRate(stageCounts.won ?? 0, stageCounts.meeting_booked ?? 0) },
                  ].map((c) => (
                    <div key={c.label} className="flex justify-between items-center py-0.5 border-b border-card-border/30 last:border-b-0 font-mono">
                      <span className="text-text-secondary">{c.label}</span>
                      <span className="font-bold text-brand-orange">{c.rate}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Task Progress Panel */}
          <div className="glass-card rounded-2xl p-5 hover-lift flex flex-col justify-between space-y-4">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>Task Progress Monitor</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-background/60 border border-card-border rounded-xl p-3">
                <p className="font-display font-extrabold text-xl text-green-500">{taskProgress.completed}</p>
                <span className="text-[9px] uppercase font-mono text-text-muted">Completed</span>
              </div>
              <div className="bg-background/60 border border-card-border rounded-xl p-3">
                <p className="font-display font-extrabold text-xl text-amber-500">{taskProgress.skipped}</p>
                <span className="text-[9px] uppercase font-mono text-text-muted">Skipped</span>
              </div>
              <div className="bg-background/60 border border-card-border rounded-xl p-3">
                <p className="font-display font-extrabold text-xl text-blue-500">{taskProgress.pending}</p>
                <span className="text-[9px] uppercase font-mono text-text-muted">Pending</span>
              </div>
              <div className="bg-background/60 border border-card-border rounded-xl p-3">
                <p className="font-display font-extrabold text-xl text-brand-red">{taskProgress.overdue}</p>
                <span className="text-[9px] uppercase font-mono text-text-muted">Overdue</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-[10px] font-mono font-semibold text-text-muted">
                <span>Task Completion Rate:</span>
                <span>{getConvRate(taskProgress.completed, totalTasks)}%</span>
              </div>
              <div className="w-full h-1.5 bg-card-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${getConvRate(taskProgress.completed, totalTasks)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Recent Outcomes Activity list */}
          <div className="col-span-3 glass-card rounded-2xl p-5 hover-lift space-y-4">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-red" />
              <span>Recent Outcomes Activity Feed</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase">Recent Touchpoints</h4>
                {data.recentOutcomes.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-4">No recent outcomes logged.</p>
                ) : (
                  data.recentOutcomes.slice(0, 5).map((act) => (
                    <div key={act.id} className="flex gap-2.5 text-xs pb-1 border-b border-card-border/30 last:border-b-0">
                      <span className="text-sm mt-0.5">
                        {act.type === 'meeting_booked' ? '🎉'
                          : act.type === 'email_sent' ? '📧'
                          : act.type === 'call_logged' ? '📞'
                          : act.type === 'linkedin_touch' ? '💼'
                          : '⚡'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-text-primary leading-normal">{act.description}</p>
                        <span className="text-[10px] text-text-muted font-mono block mt-0.5">
                          {new Date(act.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 border-l border-card-border/30 pl-4">
                <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase">Pipeline Distribution</h4>
                <div className="space-y-2 text-xs">
                  {funnelData.map((stage) => {
                    const pct = Math.round((stage.count / totalLeads) * 100);
                    return (
                      <div key={stage.stage} className="flex items-center gap-2">
                        <span className="text-[11px] w-24 text-text-secondary font-mono truncate">{stage.stage}</span>
                        <div className="flex-1 h-1.5 bg-card-border rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stage.fill }} />
                        </div>
                        <span className="text-[10px] font-mono text-text-muted w-6 text-right">{stage.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
