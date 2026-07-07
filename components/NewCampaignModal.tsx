'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useEscapeClose } from '@/hooks/useEscapeClose';
import { useToast } from '@/context/ToastContext';
import { readApiError } from '@/lib/api/client';

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewCampaignModal({ onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  useEscapeClose(onClose);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);

  const [form, setForm] = useState({
    name: '',
    clientId: '',
    targetVertical: '',
    targetGeo: '',
    startDate: new Date().toISOString().split('T')[0],
    status: 'active' as 'active' | 'paused',
  });

  useEffect(() => {
    fetch('/api/campaigns?type=clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data) => setClients(Array.isArray(data.clients) ? data.clients : []))
      .catch(() => {});
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!isNewClient && !form.clientId) {
      showToast('Please select a client or create a new one', 'error');
      return;
    }
    if (isNewClient && !newClientName.trim()) {
      showToast('Please enter the new client name', 'error');
      return;
    }

    setSaving(true);
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        clientId: isNewClient ? null : form.clientId,
        newClientName: isNewClient ? newClientName : undefined,
      }),
    });
    setSaving(false);

    if (res.ok) {
      showToast('Campaign created successfully!', 'success');
      onSuccess?.();
      onClose();
    } else {
      showToast(await readApiError(res, 'Failed to create campaign'), 'error');
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors';
  const labelClass = 'block text-[10px] font-bold font-mono text-text-muted uppercase mb-1 tracking-wide';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div role="dialog" aria-modal="true" aria-label="New campaign" className="bg-card-bg border border-card-border rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
            <div>
              <h2 className="font-display font-bold text-sm text-text-primary">New Campaign</h2>
              <p className="text-[10px] text-text-muted mt-0.5">Create a campaign and link it to a BPO client</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-card-border/50 rounded-lg text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Campaign Name */}
            <div>
              <label className={labelClass}>Campaign Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Acme Q3 Outreach — APAC"
                className={inputClass}
              />
            </div>

            {/* Client */}
            <div>
              <label className={labelClass}>Client *</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setIsNewClient(false)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    !isNewClient
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-background text-text-secondary border-card-border hover:border-brand-red/40'
                  }`}
                >
                  Existing Client
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewClient(true)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    isNewClient
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-background text-text-secondary border-card-border hover:border-brand-red/40'
                  }`}
                >
                  + New Client
                </button>
              </div>

              {isNewClient ? (
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="New client company name"
                  className={inputClass}
                />
              ) : (
                <select
                  value={form.clientId}
                  onChange={set('clientId')}
                  className={inputClass}
                >
                  <option value="">Select a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.industry ? `— ${c.industry}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Target Vertical + Geo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Target Vertical</label>
                <input
                  type="text"
                  value={form.targetVertical}
                  onChange={set('targetVertical')}
                  placeholder="e.g. SaaS, Fintech"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Target Geography</label>
                <input
                  type="text"
                  value={form.targetGeo}
                  onChange={set('targetGeo')}
                  placeholder="e.g. APAC, US"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Start Date + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={set('startDate')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={set('status')} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
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
                disabled={saving}
                className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  'Launch Campaign'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
