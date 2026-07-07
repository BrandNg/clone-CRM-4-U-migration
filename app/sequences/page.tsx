'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Mail,
  Phone,
  MessageSquare,
  ChevronRight,
  Repeat,
} from 'lucide-react';
import Linkedin from '@/components/icons/Linkedin';
import { useToast } from '@/context/ToastContext';

interface SequenceStep {
  id: string;
  order: number;
  channel: 'email' | 'phone' | 'linkedin' | 'whatsapp';
  delayDays: number;
  delayHours: number;
  instructions: string;
  templateId?: string | null;
  template?: { id: string; name: string; channel: string } | null;
  autoComplete: boolean;
}

interface Template {
  id: string;
  name: string;
  channel: string;
  subject?: string | null;
}

interface Sequence {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  steps: SequenceStep[];
  _count?: { leads: number };
}

export default function SequencesPage() {
  const { showToast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<Sequence | null>(null);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [newStepChannel, setNewStepChannel] = useState<SequenceStep['channel']>('email');
  const [newStepDelayDays, setNewStepDelayDays] = useState(1);
  const [newStepDelayHours, setNewStepDelayHours] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqDesc, setNewSeqDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  const loadSequences = useCallback(async () => {
    const res = await fetch('/api/sequences', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setSequences(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    loadSequences();
    fetch('/api/templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [loadSequences]);

  const handleSelectSequence = (seq: Sequence) => {
    setSelectedSeq(seq);
    setSteps(seq.steps.map((s) => ({ ...s })));
  };

  const handleAddStep = () => {
    const nextOrder = steps.length + 1;
    const newStep: SequenceStep = {
      id: `step_new_${Date.now()}`,
      order: nextOrder,
      channel: newStepChannel,
      delayDays: newStepDelayDays,
      delayHours: newStepDelayHours,
      instructions: `Log touchpoint details for the ${newStepChannel} outreach.`,
      templateId: null,
      autoComplete: newStepChannel === 'email',
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const handleCreateSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSeqName.trim()) return;
    setCreating(true);
    const res = await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSeqName, description: newSeqDesc, isActive: true, steps: [] }),
    });
    setCreating(false);
    if (res.ok) {
      showToast('Sequence created!', 'success');
      setShowCreateModal(false);
      setNewSeqName('');
      setNewSeqDesc('');
      await loadSequences();
    } else {
      showToast('Failed to create sequence', 'error');
    }
  };

  const handleDuplicate = async (seq: Sequence) => {
    const res = await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${seq.name} (Copy)`,
        description: seq.description,
        isActive: false,
        steps: seq.steps.map(({ channel, order, delayDays, delayHours, instructions, templateId, autoComplete }) => ({
          channel, order, delayDays, delayHours, instructions, templateId, autoComplete,
        })),
      }),
    });
    if (res.ok) {
      showToast('Sequence duplicated', 'success');
      await loadSequences();
    } else {
      showToast('Failed to duplicate sequence', 'error');
    }
  };

  const handleArchiveSeq = async (seq: Sequence) => {
    if (!window.confirm(`Archive "${seq.name}"? It will be hidden from the list.`)) return;
    const res = await fetch(`/api/sequences/${seq.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Sequence archived', 'success');
      await loadSequences();
    } else {
      showToast('Failed to archive sequence', 'error');
    }
  };

  const handleStepTemplateChange = (stepId: string, templateId: string | null) => {
    const tpl = templates.find((t) => t.id === templateId) ?? null;
    setSteps((prev) => prev.map((s) =>
      s.id === stepId ? { ...s, templateId: templateId ?? null, template: tpl ? { id: tpl.id, name: tpl.name, channel: tpl.channel } : null } : s
    ));
  };

  const handleDeleteStep = (id: string) => {
    const filtered = steps.filter((s) => s.id !== id);
    setSteps(filtered.map((s, idx) => ({ ...s, order: idx + 1 })));
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const updated = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setSteps(updated.map((s, idx) => ({ ...s, order: idx + 1 })));
  };

  const handleSaveBuilder = async () => {
    if (!selectedSeq) return;
    setSaving(true);
    const res = await fetch(`/api/sequences/${selectedSeq.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: selectedSeq.name,
        description: selectedSeq.description,
        isActive: selectedSeq.isActive,
        steps: steps.map((s) => ({
          channel: s.channel,
          order: s.order,
          delayDays: s.delayDays,
          delayHours: s.delayHours,
          instructions: s.instructions,
          templateId: s.templateId ?? null,
          autoComplete: s.autoComplete,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      showToast('Sequence cadence saved!', 'success');
      setSequences((prev) =>
        prev.map((s) => (s.id === selectedSeq.id ? { ...s, steps } : s))
      );
      setSelectedSeq(null);
      loadSequences();
    } else {
      showToast('Failed to save sequence', 'error');
    }
  };

  const getChannelColor = (channel: SequenceStep['channel']) => {
    switch (channel) {
      case 'email': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'phone': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'linkedin': return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20';
      case 'whatsapp': return 'text-teal-500 bg-teal-500/10 border-teal-500/20';
    }
  };

  const getChannelIcon = (channel: SequenceStep['channel']) => {
    switch (channel) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'phone': return <Phone className="w-4 h-4" />;
      case 'linkedin': return <Linkedin className="w-4 h-4" />;
      case 'whatsapp': return <MessageSquare className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            Sequence Cadences
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Design multi-step, multi-channel automated drip touchpoints for campaigns.
          </p>
        </div>
        {selectedSeq === null && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors active:scale-95 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Sequence</span>
          </button>
        )}
      </div>

      {selectedSeq === null ? (
        <div className="grid grid-cols-3 gap-6">
          {sequences.length === 0 && (
            <div className="col-span-3 text-center py-12 text-text-muted text-xs">
              No sequences yet. Create one to get started.
            </div>
          )}
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-brand-red hover:shadow-md transition-all duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-lg p-1.5 text-brand-orange">
                    <Repeat className="w-5 h-5" />
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border font-mono ${
                      seq.isActive
                        ? 'bg-green-500/15 text-green-500 border-green-500/20'
                        : 'bg-gray-500/10 text-gray-500'
                    }`}
                  >
                    {seq.isActive ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>

                <h3 className="font-display font-bold text-sm text-text-primary mb-1">{seq.name}</h3>
                <p className="text-xs text-text-secondary leading-relaxed mb-4">{seq.description}</p>

                <div className="space-y-2 border-t border-card-border/30 pt-3 text-xs mb-5">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Total Steps:</span>
                    <span className="font-semibold text-text-primary font-mono">
                      {seq.steps.length} steps
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Enrolled Leads:</span>
                    <span className="font-semibold text-brand-orange font-mono">
                      {seq._count?.leads ?? 0} active
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSelectSequence(seq)}
                  className="flex-1 py-2 bg-background hover:bg-brand-red hover:text-white border border-card-border hover:border-brand-red rounded-xl text-xs font-semibold text-text-primary transition-all flex items-center justify-center gap-1 active:scale-95"
                >
                  <span>Edit Steps</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDuplicate(seq)}
                  title="Duplicate sequence"
                  className="px-3 py-2 bg-background hover:bg-card-border border border-card-border rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary transition-all active:scale-95"
                >
                  Copy
                </button>
                <button
                  onClick={() => handleArchiveSeq(seq)}
                  title="Archive sequence"
                  className="px-3 py-2 bg-background hover:bg-brand-red/5 border border-card-border hover:border-brand-red/30 rounded-xl text-xs font-semibold text-text-muted hover:text-brand-red transition-all active:scale-95"
                >
                  Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 flex-1 items-start">
          <div className="col-span-2 space-y-4">
            <div className="bg-card-bg border border-card-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase font-bold text-text-muted font-mono tracking-wider">
                  Builder mode
                </span>
                <h2 className="font-display font-bold text-base text-text-primary mt-0.5">
                  {selectedSeq.name}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSeq(null)}
                  className="px-3 py-1.5 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBuilder}
                  disabled={saving}
                  className="px-3 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Cadence'}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="bg-card-bg border border-card-border rounded-xl p-4 shadow-sm flex items-start justify-between gap-4 hover:bg-background/20 transition-all"
                >
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-card-border/40 border border-card-border flex items-center justify-center font-mono font-bold text-xs text-text-secondary">
                      {step.order}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-bold border capitalize flex items-center gap-1 ${getChannelColor(step.channel)}`}
                        >
                          {getChannelIcon(step.channel)}
                          <span>{step.channel}</span>
                        </span>
                        <span className="text-[10px] font-mono text-text-muted">
                          Delay: {step.delayDays}d {step.delayHours}h
                        </span>
                      </div>
                      <p className="text-xs text-text-primary leading-normal pr-4">{step.instructions}</p>
                      {/* autoComplete toggle */}
                      <label className="flex items-center gap-2 cursor-pointer mt-1.5 select-none">
                        <div
                          onClick={() => setSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, autoComplete: !s.autoComplete } : s))}
                          className={`w-8 h-4 rounded-full border transition-colors flex items-center px-0.5 ${step.autoComplete ? 'bg-emerald-500/20 border-emerald-500/40' : 'bg-card-border border-card-border'}`}
                        >
                          <div className={`w-3 h-3 rounded-full transition-transform ${step.autoComplete ? 'bg-emerald-500 translate-x-4' : 'bg-text-muted translate-x-0'}`} />
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">
                          {step.autoComplete ? 'Auto-complete (email)' : 'Requires outcome log'}
                        </span>
                      </label>
                      {/* Template link */}
                      {(step.channel === 'email' || step.channel === 'linkedin') && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <select
                            value={step.templateId ?? ''}
                            onChange={(e) => handleStepTemplateChange(step.id, e.target.value || null)}
                            className="bg-background border border-card-border rounded px-2 py-1 text-[10px] text-text-secondary focus:outline-none focus:border-brand-red font-mono max-w-[200px]"
                          >
                            <option value="">— No template —</option>
                            {templates.filter((t) => t.channel === step.channel || t.channel === 'general').map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                          {step.template && (
                            <span className="text-[9px] font-mono text-brand-orange bg-brand-orange/10 border border-brand-orange/20 px-1.5 py-0.5 rounded">
                              {step.template.name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleMoveStep(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 hover:bg-card-border/50 text-text-secondary disabled:opacity-40 disabled:hover:bg-transparent rounded"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveStep(idx, 'down')}
                      disabled={idx === steps.length - 1}
                      className="p-1 hover:bg-card-border/50 text-text-secondary disabled:opacity-40 disabled:hover:bg-transparent rounded"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      className="p-1 hover:bg-brand-red/10 text-text-muted hover:text-brand-red rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {steps.length === 0 && (
                <div className="border border-dashed border-card-border rounded-xl p-8 text-center text-xs text-text-muted">
                  No steps yet. Add a step from the panel on the right.
                </div>
              )}
            </div>
          </div>

          <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-extrabold text-sm text-text-primary flex items-center gap-2">
              <span>➕</span> Add New Cadence Step
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block mb-1">
                  Select Channel
                </label>
                <select
                  value={newStepChannel}
                  onChange={(e) => setNewStepChannel(e.target.value as SequenceStep['channel'])}
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red"
                >
                  <option value="email">📧 Email outreach</option>
                  <option value="phone">📞 Phone call dial</option>
                  <option value="linkedin">💼 LinkedIn touch</option>
                  <option value="whatsapp">💬 WhatsApp message</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold font-mono text-text-muted uppercase block mb-1">
                    Wait Days
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={newStepDelayDays}
                    onChange={(e) => setNewStepDelayDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold font-mono text-text-muted uppercase block mb-1">
                    Wait Hours
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={newStepDelayHours}
                    onChange={(e) => setNewStepDelayHours(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red text-xs font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleAddStep}
                className="w-full py-2 bg-brand-orange hover:bg-brand-orange-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Step to Sequence</span>
              </button>
            </div>

            <div className="pt-2 border-t border-card-border text-[10px] text-text-muted leading-relaxed font-mono">
              * Changes are saved when you click "Save Cadence" above.
            </div>
          </div>
        </div>
      )}

      {/* Create New Sequence Modal */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <form
              onSubmit={handleCreateSequence}
              className="pointer-events-auto bg-card-bg border border-card-border rounded-2xl shadow-2xl w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-200 p-6 space-y-4"
            >
              <div>
                <h2 className="font-display font-bold text-sm text-text-primary">Create New Sequence</h2>
                <p className="text-[10px] text-text-muted mt-0.5">Build a reusable multi-step cadence</p>
              </div>
              <div>
                <label className="block text-[10px] font-bold font-mono text-text-muted uppercase mb-1">
                  Sequence Name *
                </label>
                <input
                  type="text"
                  required
                  value={newSeqName}
                  onChange={(e) => setNewSeqName(e.target.value)}
                  placeholder="e.g. Cold Email → LinkedIn → Call"
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand-red"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold font-mono text-text-muted uppercase mb-1">
                  Description
                </label>
                <textarea
                  value={newSeqDesc}
                  onChange={(e) => setNewSeqDesc(e.target.value)}
                  placeholder="What is this sequence for?"
                  rows={2}
                  className="w-full px-3 py-2 bg-background border border-card-border rounded-lg text-xs text-text-primary focus:outline-none focus:border-brand-red resize-none placeholder-text-muted"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 border border-card-border bg-background hover:bg-card-border/30 rounded-lg text-xs font-semibold text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60"
                >
                  {creating ? 'Creating...' : 'Create Sequence'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
