import React from 'react';
import {
  Award,
  BarChart3,
  TrendingUp,
  Clock,
  ArrowLeft,
  Users,
  MessageSquare,
  Mail,
  Zap,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

interface CampaignDetailData {
  campaignName: string;
  clientName: string;
  status: string;
  kpis: {
    meetingsBooked: number;
    contactsTouched: number;
    replies: number;
    replyRate: number;
    sequencesRunning: number;
    tasksDone: number;
  };
  stageCounts: Record<string, number>;
  sequences: {
    id: string;
    name: string;
    enrolled: number;
    completed: number;
    replyRate: number;
    meetingsBooked: number;
  }[];
  reps: {
    id: string;
    name: string;
    tasksDone: number;
    emails: number;
    calls: number;
    linkedin: number;
    whatsapp: number;
    booked: number;
  }[];
}

interface CampaignDetailProps {
  data: CampaignDetailData;
  onBack: () => void;
  dateRange: 'today' | 'week' | 'month';
  onExportPDF: () => void;
  onExportCSV: () => void;
  showTabsSwitcher: boolean;
  canExport: boolean;
}

export default function CampaignDetail({
  data,
  onBack,
  dateRange: _dateRange,
  onExportPDF,
  onExportCSV,
  showTabsSwitcher,
  canExport
}: CampaignDetailProps) {
  const { kpis, stageCounts, sequences, reps } = data;

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

  const convRates = [
    { label: 'New → Active', rate: getConvRate(stageCounts.sequence_active ?? 0, stageCounts.new ?? 0) },
    { label: 'Active → Replied', rate: getConvRate(stageCounts.replied ?? 0, stageCounts.sequence_active ?? 0) },
    { label: 'Replied → Booked', rate: getConvRate(stageCounts.meeting_booked ?? 0, stageCounts.replied ?? 0) },
    { label: 'Booked → Won', rate: getConvRate(stageCounts.won ?? 0, stageCounts.meeting_booked ?? 0) },
  ];

  return (
    <div className="space-y-6">
      {/* Detail Header */}
      <div className="flex flex-row items-center justify-between gap-4 bg-card-bg border border-card-border p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          {showTabsSwitcher && (
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-card-border/40 text-text-muted hover:text-text-primary rounded-lg transition-colors border border-card-border"
              aria-label="Back to overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <span className="text-[10px] font-bold font-mono text-brand-orange uppercase tracking-wider">
              {data.clientName}
            </span>
            <h2 className="font-display font-extrabold text-lg text-text-primary leading-tight">
              {data.campaignName}
            </h2>
          </div>
        </div>

        {canExport && (
          <div className="flex items-center gap-2 self-auto">
            <button
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-bg/80 border border-card-border text-text-secondary text-xs font-semibold rounded-lg transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={onExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm shadow-indigo-600/10"
            >
              Export PDF
            </button>
          </div>
        )}
      </div>

      {/* Six KPI cards */}
      <div className="grid grid-cols-6 gap-3 stagger-container">
        {[
          { label: 'Meetings Booked', value: kpis.meetingsBooked, Icon: Award, color: 'text-brand-gold' },
          { label: 'Contacts Touched', value: kpis.contactsTouched, Icon: Users, color: 'text-blue-500' },
          { label: 'Unique Replies', value: kpis.replies, Icon: MessageSquare, color: 'text-brand-orange' },
          { label: 'Reply Rate', value: `${kpis.replyRate}%`, Icon: TrendingUp, color: 'text-green-500' },
          { label: 'Active Sequences', value: kpis.sequencesRunning, Icon: Zap, color: 'text-purple-400' },
          { label: 'Tasks Completed', value: kpis.tasksDone, Icon: Clock, color: 'text-text-secondary' },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="stagger-child glass-card rounded-xl p-3 flex flex-col justify-between hover-lift">
            <span className="text-[9px] uppercase font-bold text-text-muted font-mono leading-tight">{label}</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className={`font-display font-extrabold text-xl ${color}`}>{value}</span>
              <Icon className={`w-3.5 h-3.5 ${color} opacity-80`} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline Funnel */}
      <div className="grid grid-cols-3 gap-6">
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
            
            {/* Conversion rates panel */}
            <div className="w-1/3 bg-background/40 border border-card-border p-4 rounded-xl space-y-2.5">
              <h4 className="text-[10px] font-bold font-mono text-text-muted uppercase">Stage Conversion</h4>
              <div className="space-y-2 text-xs">
                {convRates.map((c) => (
                  <div key={c.label} className="flex justify-between items-center py-0.5 border-b border-card-border/30 last:border-b-0">
                    <span className="text-text-secondary">{c.label}</span>
                    <span className="font-bold font-mono text-brand-orange">{c.rate}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Campaign Info summary card */}
        <div className="glass-card rounded-2xl p-5 hover-lift flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-orange" />
              <span>Campaign Metadata</span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-card-border/40">
                <span className="text-text-muted">Target Vertical</span>
                <span className="font-semibold text-text-secondary text-right">{stageCounts._targetVertical ?? 'Enterprise ERP'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-card-border/40">
                <span className="text-text-muted">Geography</span>
                <span className="font-semibold text-text-secondary text-right">SEA + ANZ</span>
              </div>
              <div className="flex justify-between py-1 border-b border-card-border/40">
                <span className="text-text-muted">Status</span>
                <span className={`font-semibold capitalize text-right ${data.status === 'active' ? 'text-green-500' : 'text-text-muted'}`}>{data.status}</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] font-mono text-text-muted leading-relaxed mt-4">
            This dashboard handles personal performance reports and screenshares for BPO clients. Sensitive manager-internal KPIs are hidden.
          </p>
        </div>
      </div>

      {/* Sequences Performance */}
      <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <Mail className="w-5 h-5 text-brand-red" />
            <span>Active Sequences Performance</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                <th className="p-3">Sequence Name</th>
                <th className="p-3 text-center">Enrolled</th>
                <th className="p-3 text-center">Completed</th>
                <th className="p-3 text-center">Reply Rate</th>
                <th className="p-3 text-center">Meetings Booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border text-text-secondary">
              {sequences.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text-muted">
                    No sequences are currently active for this campaign.
                  </td>
                </tr>
              ) : (
                sequences.map((seq) => (
                  <tr key={seq.id} className="hover:bg-background/40">
                    <td className="p-3 font-semibold text-text-primary">{seq.name}</td>
                    <td className="p-3 text-center font-mono">{seq.enrolled}</td>
                    <td className="p-3 text-center font-mono">{seq.completed}</td>
                    <td className="p-3 text-center font-bold font-mono text-brand-orange">{seq.replyRate}%</td>
                    <td className="p-3 text-center font-bold font-mono text-brand-gold">{seq.meetingsBooked}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reps Performance */}
      <div className="glass-card rounded-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-card-border bg-background/25 flex items-center justify-between">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-red" />
            <span>Assigned Reps Outreach Breakdown</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-background/50 border-b border-card-border text-[10px] uppercase font-bold font-mono tracking-wider text-text-muted">
                <th className="p-3">Rep</th>
                <th className="p-3 text-center">Tasks Completed</th>
                <th className="p-3 text-center">Emails Sent</th>
                <th className="p-3 text-center">Calls Made</th>
                <th className="p-3 text-center">LinkedIn</th>
                <th className="p-3 text-center">WhatsApp</th>
                <th className="p-3 text-center text-brand-gold">Meetings Booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border text-text-secondary">
              {reps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-text-muted">
                    No SDRs assigned to this campaign.
                  </td>
                </tr>
              ) : (
                reps.map((rep) => (
                  <tr key={rep.id} className="hover:bg-background/40">
                    <td className="p-3 font-semibold text-text-primary">{rep.name}</td>
                    <td className="p-3 text-center font-mono">{rep.tasksDone}</td>
                    <td className="p-3 text-center font-mono">{rep.emails}</td>
                    <td className="p-3 text-center font-mono">{rep.calls}</td>
                    <td className="p-3 text-center font-mono">{rep.linkedin}</td>
                    <td className="p-3 text-center font-mono">{rep.whatsapp}</td>
                    <td className="p-3 text-center font-bold font-mono text-brand-gold bg-brand-gold/[0.01]">{rep.booked}</td>
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
