'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { readApiError } from '@/lib/api/client';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewLeadModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    company: '',
    title: '',
    email: '',
    phone: '',
    linkedIn: '',
    priority: 'warm' as 'hot' | 'warm' | 'cold',
    campaignId: '',
  });

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCampaigns(list);
        if (list.length > 0) setForm((p) => ({ ...p, campaignId: list[0].id }));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      showToast('Lead created successfully!', 'success');
      onSuccess?.();
      onClose();
    } else {
      showToast(await readApiError(res, 'Failed to create lead'), 'error');
    }
  };

  const set =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const inputClass =
    'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
  const labelClass = 'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="Add new lead" className="glass-card rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
            <div>
              <h2 className="font-display font-bold text-sm text-text-primary">New Lead</h2>
              <p className="text-[10px] text-text-muted mt-0.5">Add a prospect to the pipeline</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors focus-ring"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>First Name *</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={set('firstName')}
                  placeholder="Sarah"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={set('lastName')}
                  placeholder="Chen"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Company + Title */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Company *</label>
                <input
                  type="text"
                  required
                  value={form.company}
                  onChange={set('company')}
                  placeholder="Acme Corp"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Job Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="VP Operations"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={labelClass}>Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set('email')}
                placeholder="sarah.chen@acme.com"
                className={inputClass}
              />
            </div>

            {/* Phone + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={set('phone')}
                  placeholder="+1 555-000-0000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  value={form.priority}
                  onChange={set('priority')}
                  className={inputClass}
                >
                  <option value="hot">🔥 Hot</option>
                  <option value="warm">⚡ Warm</option>
                  <option value="cold">❄️ Cold</option>
                </select>
              </div>
            </div>

            {/* Campaign */}
            {campaigns.length > 0 ? (
              <div>
                <label className={labelClass}>Campaign <span className="text-brand-red">*</span></label>
                <select value={form.campaignId} onChange={set('campaignId')} className={inputClass}>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                No campaigns exist yet. Please create a campaign before adding leads.
              </div>
            )}

            {/* LinkedIn */}
            <div>
              <label className={labelClass}>LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedIn}
                onChange={set('linkedIn')}
                placeholder="https://linkedin.com/in/..."
                className={inputClass}
              />
            </div>

            {/* Footer */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || campaigns.length === 0}
                className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  'Add to Pipeline'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
