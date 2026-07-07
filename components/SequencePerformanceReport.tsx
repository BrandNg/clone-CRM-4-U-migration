'use client';

import { Send, MessageSquare, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
import type { ScopedSequenceStats } from '@/lib/sequences/analytics';

interface SequencePerformanceReportProps {
  stats: ScopedSequenceStats | null;
  loading?: boolean;
  /** Optional caption clarifying the scope, e.g. "Across your pod" / "Org-wide". */
  scopeLabel?: string;
}

/**
 * Presentational scoped sequence-performance report (KPIs + per-sequence breakdown).
 * Data is fetched by the parent (Team View / Leadgen Outcomes) from /api/sequences/team-analytics
 * and passed in — this component never fetches, so it can be reused in any manager surface.
 */
export default function SequencePerformanceReport({ stats, loading, scopeLabel }: SequencePerformanceReportProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-brand-red border-t-transparent" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-card-bg border border-card-border rounded-2xl p-8 text-center">
        <BarChart3 className="w-10 h-10 text-text-muted/40 mx-auto mb-3" />
        <p className="text-xs text-text-muted">No sequence performance data available.</p>
      </div>
    );
  }

  const cards = [
    {
      icon: Send,
      tone: 'text-blue-500',
      label: 'Sends Today',
      value: stats.todaySends,
      sub: `${stats.weekSends} this week · ${stats.monthSends} this month`,
    },
    {
      icon: MessageSquare,
      tone: 'text-emerald-500',
      label: 'Replies',
      value: stats.todayReplies,
      sub: `${stats.weekReplies} this week`,
    },
    {
      icon: TrendingUp,
      tone: 'text-amber-500',
      label: 'Active Enrollments',
      value: stats.activeEnrollments,
      sub: `of ${stats.totalLeads} leads in scope`,
    },
    {
      icon: AlertTriangle,
      tone: 'text-red-500',
      label: 'Bounces',
      value: stats.totalBounces,
      sub: 'flagged invalid',
    },
  ];

  return (
    <div className="space-y-5">
      {scopeLabel && (
        <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{scopeLabel}</p>
      )}

      <div className="grid grid-cols-4 gap-4">
        {cards.map(({ icon: Icon, tone, label, value, sub }) => (
          <div key={label} className="bg-card-bg border border-card-border rounded-2xl p-4 shadow-sm">
            <div className={`flex items-center gap-2 mb-3 ${tone}`}>
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-bold font-mono uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-2xl font-display font-extrabold text-text-primary">{value}</div>
            <div className="text-[10px] text-text-muted font-mono mt-1">{sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-card-bg border border-card-border rounded-2xl p-4 shadow-sm">
        <h3 className="font-display font-bold text-sm text-text-primary mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-brand-orange" />
          Sequences in Scope
        </h3>
        <div className="overflow-hidden rounded-xl border border-card-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                <th className="text-left px-3 py-2">Sequence</th>
                <th className="text-right px-3 py-2">Enrolled</th>
                <th className="text-right px-3 py-2">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {stats.sequences.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-text-muted">No active sequences.</td>
                </tr>
              ) : (
                stats.sequences.map((seq) => (
                  <tr key={seq.id} className="hover:bg-background/40">
                    <td className="px-3 py-2 font-semibold text-text-primary">{seq.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-text-secondary">{seq._count.leads}</td>
                    <td className="px-3 py-2 text-right font-mono text-blue-500">{seq.activeLeads}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
