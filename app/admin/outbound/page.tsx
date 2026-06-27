'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Mail, AlertCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface OutboundMessage {
  id: string;
  leadId: string;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
  } | null;
  accountId: string;
  account: {
    id: string;
    email: string;
  };
  to: string;
  subject: string | null;
  body: string | null;
  providerMessageId: string | null;
  idempotencyKey: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function OutboundAdminPage() {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/admin/outbound';
      if (statusFilter !== 'all') url += `?status=${statusFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      } else {
        showToast('Failed to fetch outbound messages', 'error');
      }
    } catch {
      showToast('Network error loading messages', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, statusFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'sending':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'failed':
      case 'bounced':
        return 'bg-brand-red/10 text-brand-red border-brand-red/20';
      case 'pending':
      default:
        return 'bg-gray-500/10 text-text-muted border-card-border';
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-card-bg border border-card-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>

        <button
          onClick={fetchMessages}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card-bg hover:bg-card-border/40 border border-card-border text-text-secondary hover:text-text-primary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Message Table */}
      <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        {loading && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-text-muted text-xs font-mono animate-pulse">Loading message records...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-2">
            <Mail className="w-8 h-8 text-text-muted" />
            <p className="text-xs text-text-muted">No outbound messages found.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-card-border bg-background/25 sticky top-0 backdrop-blur-md">
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Recipient</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Subject</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">From Account</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Status</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide">Sent At / Created At</th>
                  <th className="p-4 font-bold font-mono text-[10px] text-text-muted uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {messages.map((msg) => {
                  const isExpanded = expandedId === msg.id;
                  return (
                    <Fragment key={msg.id}>
                      <tr
                        className={`hover:bg-background/40 transition-colors ${
                          isExpanded ? 'bg-background/20' : ''
                        }`}
                      >
                        <td className="p-4">
                          <div>
                            <span className="font-semibold text-text-primary block">{msg.to}</span>
                            {msg.lead && (
                              <span className="text-[10px] text-text-secondary block">
                                Lead: {msg.lead.firstName} {msg.lead.lastName} ({msg.lead.company})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-text-primary truncate max-w-[200px] block">
                            {msg.subject || <span className="text-text-muted italic">— no subject —</span>}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-text-secondary font-mono">{msg.account?.email}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getStatusColor(msg.status)}`}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="p-4 text-text-muted font-mono">
                          {msg.sentAt ? (
                            <span className="text-emerald-400">
                              Sent: {new Date(msg.sentAt).toLocaleString()}
                            </span>
                          ) : (
                            <span>Created: {new Date(msg.createdAt).toLocaleString()}</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                            className="text-[10px] font-semibold text-brand-orange hover:underline font-mono"
                          >
                            {isExpanded ? 'Hide Payload' : 'View Payload'}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-background/10 border-b border-card-border">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {/* Left column: metadata & errors */}
                              <div className="space-y-3">
                                <div>
                                  <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Idempotency Key</p>
                                  <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] overflow-x-auto text-text-secondary">
                                    {msg.idempotencyKey}
                                  </pre>
                                </div>

                                {msg.providerMessageId && (
                                  <div>
                                    <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Provider Message ID</p>
                                    <pre className="bg-background/60 border border-card-border rounded-lg p-2.5 font-mono text-[10px] overflow-x-auto text-text-secondary">
                                      {msg.providerMessageId}
                                    </pre>
                                  </div>
                                )}

                                {(msg.status === 'failed' || msg.status === 'bounced') && msg.errorMessage && (
                                  <div className="bg-brand-red/[0.03] border border-brand-red/20 rounded-xl p-3 space-y-1">
                                    <h4 className="text-[10px] font-bold font-mono text-brand-red uppercase tracking-wider flex items-center gap-1">
                                      <AlertCircle className="w-3.5 h-3.5" />
                                      Delivery Failure Report
                                    </h4>
                                    <p className="font-mono text-[10px] text-brand-red leading-relaxed break-words whitespace-pre-wrap">
                                      {msg.errorMessage}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Right column: email content body */}
                              <div className="flex flex-col">
                                <p className="font-mono text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">Email Body</p>
                                <div className="bg-background/60 border border-card-border rounded-xl p-3 flex-1 font-mono text-[11px] text-text-secondary overflow-y-auto max-h-48 whitespace-pre-wrap break-words">
                                  {msg.body || <span className="text-text-muted italic">— no content —</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
