import React from 'react';
import { AlertTriangle, Clock, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

interface UserAlert {
  userId: string;
  name: string;
  role: string;
  overdueCount: number;
  atRiskCount: number;
}

interface AtRiskLead {
  id: string;
  leadId: string;
  leadName: string;
  company: string;
  assignedTo: string;
  daysOverdue: number;
}

interface OverdueAlertsProps {
  users: UserAlert[];
  atRiskLeads: AtRiskLead[];
  onSelectLead: (leadId: string) => void;
}

export default function OverdueAlerts({ users, atRiskLeads, onSelectLead }: OverdueAlertsProps) {
  return (
    <div className="grid grid-cols-2 gap-6">
      {/* SDRs Overdue Monitor */}
      <div className="glass-card rounded-2xl p-5 hover-lift space-y-4 flex flex-col justify-between">
        <div className="space-y-4">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand-red" />
            <span>Rep Overdue Tasks Monitor</span>
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {users.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No rep task data available.</p>
            ) : (
              users.map((u) => (
                <div
                  key={u.userId}
                  className={`p-3 border rounded-xl flex items-center justify-between gap-3 text-xs bg-background/20 transition-all ${
                    u.overdueCount > 0 ? 'border-brand-red/30 hover:border-brand-red/50' : 'border-card-border'
                  }`}
                >
                  <div>
                    <Link
                      href={`/?userId=${u.userId}&tab=overdue`}
                      className="font-semibold text-text-primary hover:text-brand-red hover:underline flex items-center gap-1 group/link"
                    >
                      {u.name}
                      <ArrowUpRight className="w-3.5 h-3.5 text-text-muted group-hover/link:text-brand-red" />
                    </Link>
                    <p className="text-[10px] text-text-muted mt-0.5 font-mono capitalize">
                      {u.role.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {u.atRiskCount > 0 && (
                      <span
                        className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold rounded-lg font-mono"
                        title="Leads with sequence tasks overdue 3+ days"
                      >
                        ⚠ {u.atRiskCount} AT RISK
                      </span>
                    )}
                    {u.overdueCount > 0 ? (
                      <span className="px-2 py-0.5 bg-brand-red/10 border border-brand-red/20 text-brand-red text-[10px] font-bold rounded-lg font-mono">
                        {u.overdueCount} OVERDUE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-lg font-mono">
                        CLEAN
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* At-risk leads */}
      <div className="glass-card rounded-2xl p-5 hover-lift space-y-4 flex flex-col justify-between">
        <div className="space-y-4">
          <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span>At-Risk Outreach Leads (3+ Days Overdue)</span>
          </h3>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {atRiskLeads.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-4">No at-risk leads detected.</p>
            ) : (
              atRiskLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onSelectLead(lead.leadId)}
                  className="p-3 border border-card-border hover:border-amber-500/30 bg-background/20 rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer transition-all hover:bg-background/45"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">
                      {lead.leadName}
                    </p>
                    <p className="text-[10px] text-text-secondary truncate mt-0.5">
                      {lead.company} · <span className="font-mono">{lead.assignedTo}</span>
                    </p>
                  </div>
                  <span className="px-2 py-0.5 bg-brand-red/10 border border-brand-red/20 text-brand-red text-[10px] font-bold rounded-lg font-mono flex-shrink-0">
                    ⚠️ {lead.daysOverdue} DAYS OVERDUE
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
