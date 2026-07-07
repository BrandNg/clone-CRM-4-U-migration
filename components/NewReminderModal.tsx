'use client';

import React, { useState } from 'react';
import { X, Bell } from 'lucide-react';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useToast } from '@/context/ToastContext';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewReminderModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState('');
  const [dueAt, setDueAt] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !dueAt) return;
    setSaving(true);
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, dueAt: new Date(dueAt).toISOString() }),
    });
    setSaving(false);
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('crm:reminder-created'));
      showToast('Reminder set!', 'success');
      onSuccess?.();
      onClose();
    } else {
      showToast('Failed to create reminder', 'error');
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
  const labelClass = 'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="New reminder" className="bg-card-bg border border-card-border rounded-2xl shadow-2xl w-full max-w-xs pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-brand-gold" />
              <div>
                <h2 className="font-display font-bold text-sm text-text-primary">New Reminder</h2>
                <p className="text-[10px] text-text-muted mt-0.5">Set a timed alert</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3.5">
            <div>
              <label className={labelClass}>Reminder Text *</label>
              <textarea
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Follow up with Sarah about proposal"
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass}>Remind Me At *</label>
              <input
                type="datetime-local"
                required
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-gold hover:opacity-90 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5">
                {saving ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Setting...</span></> : 'Set Reminder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
