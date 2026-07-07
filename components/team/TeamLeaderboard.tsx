import React from 'react';
import { Award } from 'lucide-react';

interface LeaderboardUser {
  id: string;
  name: string;
  role: string;
  calls: number;
  emails: number;
  linkedin: number;
  whatsapp: number;
  booked: number;
  total: number;
}

interface TeamLeaderboardProps {
  leaderboard: LeaderboardUser[];
  dateRange: 'today' | 'week' | 'month';
}

export default function TeamLeaderboard({ leaderboard, dateRange }: TeamLeaderboardProps) {
  const getRankBadge = (idx: number) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return <span className="w-5 h-5 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center font-mono font-bold text-[10px]">{idx + 1}</span>;
  };

  const dateLabel =
    dateRange === 'today' ? 'Today' :
    dateRange === 'week' ? 'This Week' : 'This Month';

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
        <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
          <Award className="w-5 h-5 text-brand-red" />
          <span>SDR Activity Leaderboard</span>
        </h3>
        <span className="text-[10px] font-mono text-text-muted">{dateLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
              <th className="p-3 w-16 text-center">Rank</th>
              <th className="p-3">Rep Name</th>
              <th className="p-3">Role</th>
              <th className="p-3 text-center">Calls</th>
              <th className="p-3 text-center">Emails</th>
              <th className="p-3 text-center">LinkedIn</th>
              <th className="p-3 text-center">WhatsApp</th>
              <th className="p-3 text-center text-brand-gold">Booked</th>
              <th className="p-3 text-center font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border text-text-secondary">
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-text-muted">
                  No activity data recorded in this timeframe.
                </td>
              </tr>
            ) : (
              leaderboard.map((rep, idx) => (
                <tr key={rep.id} className="hover:bg-background/40 table-row-dense">
                  <td className="p-3 text-center text-sm flex items-center justify-center h-full">
                    {getRankBadge(idx)}
                  </td>
                  <td className="p-3 font-semibold text-text-primary">
                    {rep.name}
                  </td>
                  <td className="p-3 font-mono text-[10px] text-text-muted capitalize">
                    {rep.role.replace('_', ' ')}
                  </td>
                  <td className="p-3 text-center font-medium font-mono">{rep.calls}</td>
                  <td className="p-3 text-center font-medium font-mono">{rep.emails}</td>
                  <td className="p-3 text-center font-medium font-mono">{rep.linkedin}</td>
                  <td className="p-3 text-center font-medium font-mono">{rep.whatsapp}</td>
                  <td className="p-3 text-center font-bold font-mono text-brand-gold bg-brand-gold/[0.02]">
                    {rep.booked}
                  </td>
                  <td className="p-3 text-center font-bold font-mono text-text-primary">
                    {rep.total}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
