import React from 'react';
import { Award, BarChart3, TrendingUp, ChevronRight } from 'lucide-react';

interface CampaignSummary {
  id: string;
  name: string;
  client: { name: string };
  status: string;
  meetingsBooked: number;
  contactsTouched: number;
  replyRate: number;
  isActive: boolean;
}

interface CampaignOverviewProps {
  campaigns: CampaignSummary[];
  onSelectCampaign: (id: string) => void;
  dateRange: 'today' | 'week' | 'month';
}

export default function CampaignOverview({
  campaigns,
  onSelectCampaign,
  dateRange
}: CampaignOverviewProps) {
  // Aggregate stats across visible campaigns
  const totalMeetings = campaigns.reduce((sum, c) => sum + c.meetingsBooked, 0);
  const totalTouched = campaigns.reduce((sum, c) => sum + c.contactsTouched, 0);
  const activeCount = campaigns.filter((c) => c.status === 'active').length;
  
  // Weighted average reply rate
  const totalReplies = campaigns.reduce((sum, c) => sum + Math.round((c.replyRate * c.contactsTouched) / 100), 0);
  const avgReplyRate = totalTouched > 0 ? Math.round((totalReplies / totalTouched) * 100) : 0;

  const dateLabel =
    dateRange === 'today' ? 'Today' :
    dateRange === 'week' ? 'This Week' : 'This Month';

  return (
    <div className="space-y-6">
      {/* Aggregate KPI row */}
      <div className="grid grid-cols-4 gap-4 stagger-container">
        {[
          {
            label: 'Total Meetings Booked',
            value: totalMeetings,
            Icon: Award,
            color: 'text-brand-gold',
            bg: 'bg-brand-gold/10',
            border: 'border-brand-gold/20',
          },
          {
            label: 'Contacts Touched',
            value: totalTouched,
            Icon: BarChart3,
            color: 'text-blue-500',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20',
          },
          {
            label: 'Avg Reply Rate',
            value: `${avgReplyRate}%`,
            Icon: TrendingUp,
            color: 'text-green-500',
            bg: 'bg-green-500/10',
            border: 'border-green-500/20',
          },
          {
            label: 'Active Campaigns',
            value: activeCount,
            Icon: BarChart3,
            color: 'text-brand-orange',
            bg: 'bg-brand-orange/10',
            border: 'border-brand-orange/20',
          },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="stagger-child glass-card rounded-2xl p-4 hover-lift flex items-center justify-between group">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">{label}</span>
              <p className={`font-display font-extrabold text-2xl ${color}`}>{value}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center ${color} group-hover:scale-110 transition-transform`}>
              <Icon className="w-5 h-5" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      {/* Campaigns Table */}
      <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-red" />
            <span>Outbound Campaigns Performance ({dateLabel})</span>
          </h3>
          <span className="text-[10px] font-mono text-text-muted">Safe for client screenshare</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                <th className="p-3 w-16 text-center">Status</th>
                <th className="p-3">Campaign Name</th>
                <th className="p-3">Client</th>
                <th className="p-3 text-center">Meetings Booked</th>
                <th className="p-3 text-center">Contacts Touched</th>
                <th className="p-3 text-center">Reply Rate</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border text-text-secondary">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-text-muted">
                    No active campaigns in this view scope.
                  </td>
                </tr>
              ) : (
                campaigns.map((camp) => (
                  <tr
                    key={camp.id}
                    onClick={() => onSelectCampaign(camp.id)}
                    className="hover:bg-background/40 cursor-pointer table-row-dense group"
                  >
                    <td className="p-3 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full border ${
                          camp.isActive
                            ? 'bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)]'
                            : 'bg-zinc-600 border-zinc-500'
                        }`}
                        title={camp.isActive ? 'Active' : 'Paused'}
                      />
                    </td>
                    <td className="p-3 font-semibold text-text-primary group-hover:text-brand-red transition-colors">
                      {camp.name}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-text-muted">
                      {camp.client.name}
                    </td>
                    <td className="p-3 text-center font-bold font-mono text-brand-gold bg-brand-gold/[0.01]">
                      {camp.meetingsBooked}
                    </td>
                    <td className="p-3 text-center font-medium font-mono">
                      {camp.contactsTouched}
                    </td>
                    <td className="p-3 text-center font-bold font-mono text-brand-orange">
                      {camp.replyRate}%
                    </td>
                    <td className="p-3 text-right">
                      <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-brand-red group-hover:translate-x-0.5 transition-all" />
                    </td>
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
