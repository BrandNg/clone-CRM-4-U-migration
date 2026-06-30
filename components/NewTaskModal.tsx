'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { readApiError } from '@/lib/api/client';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewTaskModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [leads, setLeads] = useState<{ id: string; firstName: string; lastName: string; company: string }[]>([]);
  const [form, setForm] = useState({
    leadId: '',
    type: 'email' as 'email' | 'phone' | 'linkedin' | 'whatsapp' | 'manual',
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium' as 'high' | 'medium' | 'low',
  });

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLeads(Array.isArray(data) ? data.slice(0, 50) : []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leadId) { showToast('Please select a lead', 'error'); return; }
    setSaving(true);
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      showToast('Task created!', 'success');
      onSuccess?.();
      onClose();
    } else {
      showToast(await readApiError(res, 'Failed to create task'), 'error');
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
  const labelClass = 'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="New task" className="bg-card-bg border border-card-border rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
            <div>
              <h2 className="font-display font-bold text-sm text-text-primary">New Task</h2>
              <p className="text-[10px] text-text-muted mt-0.5">Schedule an outreach action</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3.5">
            <div>
              <label className={labelClass}>Lead *</label>
              <select
                required
                value={form.leadId}
                onChange={(e) => setForm((p) => ({ ...p, leadId: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select a lead...</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.firstName} {l.lastName} — {l.company}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Channel</label>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as any }))} className={inputClass}>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value as any }))} className={inputClass}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Task Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Follow-up email after demo"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Notes / Instructions</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="What to say or do..."
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass}>Due Date & Time *</label>
              <input
                type="datetime-local"
                required
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Saving...</span></> : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
