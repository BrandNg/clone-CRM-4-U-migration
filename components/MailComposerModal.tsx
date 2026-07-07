'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Send, X, AlertCircle, Loader2 } from 'lucide-react';

interface Task { id: string; type: string; title: string; description: string; dueDate: string; status: string; leadId: string; }
interface Lead { id: string; firstName: string; lastName: string; company: string; title: string; email: string; phone?: string; }
interface EmailAccount { id: string; email: string; provider: string }

interface MailComposerModalProps {
  lead: Lead;
  onClose: () => void;
  /** Optional task context (when composing from an email task). */
  task?: Task;
  /** Called after a successful send so the parent can refresh activities. */
  onSent?: () => void;
}

export default function MailComposerModal({ lead, onClose, onSent }: MailComposerModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    Promise.all([
      fetch('/api/templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/email/accounts').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([templates, accounts]: [{ channel: string; subject?: string | null; body: string }[], EmailAccount[]]) => {
        setAccount(Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null);

        const template = templates.find((t) => t.channel === 'email') ?? templates[0];
        if (!template) { setSubject('Following up'); return; }

        const replacements: Record<string, string> = {
          firstName: lead.firstName, lastName: lead.lastName, company: lead.company,
          title: lead.title, email: lead.email, phone: lead.phone || 'your phone number',
          sdrName: 'SDR', sdrTitle: 'Sales Development Representative',
        };
        const substitute = (str: string) =>
          Object.entries(replacements).reduce(
            (s, [k, v]) => s.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v), str);

        setSubject(substitute(template.subject ?? 'Following up'));
        setBody(substitute(template.body));
      })
      .catch(() => setSubject('Following up'))
      .finally(() => setLoadingAccount(false));
  }, [lead]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: account.id, to: lead.email, subject, body, leadId: lead.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send email.');
      }
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Compose email">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="bg-card-bg border border-card-border rounded-2xl shadow-xl w-full max-w-lg relative z-10 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-card-border bg-background/50">
          <h2 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-500" />
            <span>Compose Email</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Close composer"
            className="text-text-muted hover:text-text-primary rounded p-1 hover:bg-card-border/30 focus-ring">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* Connection status / graceful degradation */}
          {account ? (
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-[10px] text-text-secondary leading-normal flex gap-2">
              <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" aria-hidden="true" />
              <span>Sending from <strong>{account.email}</strong>. The send is logged on the lead automatically.</span>
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-[10px] text-text-secondary leading-normal flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
              <span>
                No email account connected.{' '}
                <Link href="/settings" onClick={onClose} className="text-brand-orange font-semibold hover:underline">Connect one in Settings</Link>
                {' '}to send from the CRM, or{' '}
                <a href={`mailto:${lead.email}?subject=${encodeURIComponent(subject)}`} className="text-brand-orange font-semibold hover:underline">open your mail app</a>.
              </span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="mail-to" className="text-[10px] font-bold font-mono text-text-muted uppercase block">Recipient</label>
            <input id="mail-to" type="text" value={`${lead.firstName} ${lead.lastName} <${lead.email}>`} disabled
              className="w-full bg-card-border/20 border border-transparent rounded-lg px-2.5 py-1.5 text-text-muted cursor-not-allowed font-medium" />
          </div>

          <div className="space-y-1">
            <label htmlFor="mail-subject" className="text-[10px] font-bold font-mono text-text-muted uppercase block">Subject Line</label>
            <input id="mail-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required
              className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="mail-body" className="text-[10px] font-bold font-mono text-text-muted uppercase block">Body</label>
            <textarea id="mail-body" value={body} onChange={(e) => setBody(e.target.value)} required
              className="w-full bg-background border border-card-border rounded-xl p-3 text-text-primary focus:outline-none focus:border-brand-red h-48 placeholder-text-muted resize-none leading-relaxed font-mono text-xs" />
          </div>

          {error && (
            <p role="alert" className="text-[11px] text-brand-red font-semibold">{error}</p>
          )}
        </div>

        <div className="p-4 border-t border-card-border bg-background/30 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-3.5 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors focus-ring">
            Cancel
          </button>
          <button type="submit" disabled={!account || sending || loadingAccount}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 active:scale-95 focus-ring">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{sending ? 'Sending…' : 'Send Email'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
