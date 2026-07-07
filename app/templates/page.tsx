'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Mail,
  Phone,
  MessageSquare,
  FileText,
  FileEdit,
  Eye,
} from 'lucide-react';
import Linkedin from '@/components/icons/Linkedin';
import { useToast } from '@/context/ToastContext';
import { useAppContext } from '@/context/AppContext';

interface Template {
  id: string;
  name: string;
  channel: 'email' | 'phone' | 'linkedin' | 'whatsapp';
  subject?: string | null;
  body: string;
  category: string;
  updatedAt: string;
}

interface AbTestVariant {
  id: string;
  version: string;
  subject: string | null;
  body: string | null;
  sentCount: number;
  replyCount: number;
}

const MERGE_FIELDS = ['firstName', 'lastName', 'company', 'title', 'email', 'phone', 'sdrName', 'sdrTitle'];

const PREVIEW_DATA: Record<string, string> = {
  firstName: 'Sarah',
  lastName: 'Chen',
  company: 'Acme Corp',
  title: 'VP Operations',
  email: 'sarah.chen@acme.com',
  phone: '+1 555-019-2834',
  sdrName: 'Minh Tran',
  sdrTitle: 'Senior SDR',
};

export default function TemplatesPage() {
  const { showToast } = useToast();
  const { isManager } = useAppContext();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemp, setSelectedTemp] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Template['channel']>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [activePane, setActivePane] = useState<'edit' | 'preview'>('edit');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [abVariants, setAbVariants] = useState<AbTestVariant[]>([]);
  const [abOpen, setAbOpen] = useState(false);
  const [creatingAb, setCreatingAb] = useState(false);

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  const loadAbVariants = useCallback(async (templateId: string) => {
    const res = await fetch(`/api/templates/${templateId}/ab-test`);
    if (res.ok) {
      const data = await res.json();
      setAbVariants(Array.isArray(data) ? data : []);
    } else {
      setAbVariants([]);
    }
  }, []);

  const handleSelectTemplate = (temp: Template) => {
    setSelectedTemp(temp);
    setName(temp.name);
    setChannel(temp.channel);
    setSubject(temp.subject ?? '');
    setBody(temp.body);
    setCategory(temp.category);
    setActivePane('edit');
    setAbOpen(false);
    if (isManager) loadAbVariants(temp.id);
  };

  const handleInsertMergeField = (field: string) => {
    setBody((prev) => prev + ` {{${field}}}`);
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemp) return;
    setSaving(true);
    const res = await fetch(`/api/templates/${selectedTemp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        channel,
        subject: channel === 'email' ? subject : null,
        body,
        category,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTemp(updated);
      showToast('Template saved!', 'success');
    } else {
      showToast('Failed to save template', 'error');
    }
  };

  const handleNewTemplate = async () => {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Template',
        channel: 'email',
        subject: '',
        body: 'Enter your message here...',
        category: 'general',
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setTemplates((prev) => [created, ...prev]);
      handleSelectTemplate(created);
      showToast('Template created', 'success');
    } else {
      showToast('Failed to create template', 'error');
    }
  };

  const handleCreateAbVariant = async () => {
    if (!selectedTemp || creatingAb) return;
    setCreatingAb(true);
    const res = await fetch(`/api/templates/${selectedTemp.id}/ab-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectB: selectedTemp.channel === 'email' ? subject : null,
        bodyB: body,
      }),
    });
    setCreatingAb(false);
    if (res.ok) {
      const variant = await res.json();
      setAbVariants((prev) => [...prev, variant]);
      showToast('B variant created', 'success');
    } else {
      showToast('Failed to create B variant', 'error');
    }
  };

  const handleRemoveAbVariant = async (variantId: string) => {
    if (!selectedTemp) return;
    const res = await fetch(`/api/templates/${selectedTemp.id}/ab-test`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variantId }),
    });
    if (res.ok) {
      setAbVariants((prev) => prev.filter((v) => v.id !== variantId));
      showToast('B variant removed', 'success');
    } else {
      showToast('Failed to remove B variant', 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedTemp?.id === id) setSelectedTemp(null);
      showToast('Template deleted', 'success');
    }
  };

  const applyMergeFields = (text: string) => {
    let result = text;
    Object.entries(PREVIEW_DATA).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
    });
    return result;
  };

  const getPreviewText = () => applyMergeFields(body);

  const filteredTemplates = templates.filter((t) => {
    const matchesChannel = filterChannel === 'all' || t.channel === filterChannel;
    const matchesSearch =
      !debouncedSearch ||
      t.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.body.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesChannel && matchesSearch;
  });

  const getChannelIcon = (type: Template['channel']) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4 text-blue-500" />;
      case 'phone': return <Phone className="w-4 h-4 text-green-500" />;
      case 'linkedin': return <Linkedin className="w-4 h-4 text-indigo-500" />;
      case 'whatsapp': return <MessageSquare className="w-4 h-4 text-teal-500" />;
    }
  };

  const getChannelColor = (type: Template['channel']) => {
    switch (type) {
      case 'email': return 'bg-blue-500/10 border-blue-500/20';
      case 'phone': return 'bg-green-500/10 border-green-500/20';
      case 'linkedin': return 'bg-indigo-500/10 border-indigo-500/20';
      case 'whatsapp': return 'bg-teal-500/10 border-teal-500/20';
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            Templates Library
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Create and customize multi-channel message scripts with dynamic merge variables.
          </p>
        </div>
        <button
          onClick={handleNewTemplate}
          className="flex items-center gap-1.5 px-3 py-2 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6 flex-1 items-stretch">
        {/* List pane */}
        <div className="space-y-4">
          <div className="bg-card-bg border border-card-border rounded-xl p-3 shadow-sm space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-background border border-card-border rounded-lg text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {['all', 'email', 'phone', 'linkedin', 'whatsapp'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setFilterChannel(ch)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold border capitalize transition-colors ${
                    filterChannel === ch
                      ? 'bg-brand-red/10 border-brand-red/20 text-brand-red'
                      : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
            {filteredTemplates.length === 0 && (
              <p className="text-xs text-text-muted text-center py-8">No templates found.</p>
            )}
            {filteredTemplates.map((temp) => (
              <div
                key={temp.id}
                onClick={() => handleSelectTemplate(temp)}
                className={`p-4 bg-card-bg border rounded-2xl cursor-pointer shadow-sm hover:shadow hover:border-brand-red transition-all duration-200 flex items-start gap-3.5 ${
                  selectedTemp?.id === temp.id
                    ? 'border-brand-red bg-brand-red/[0.01]'
                    : 'border-card-border'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${getChannelColor(temp.channel)}`}
                >
                  {getChannelIcon(temp.channel)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="bg-card-border/50 text-text-secondary text-[8px] font-extrabold px-1.5 py-0.5 rounded font-mono uppercase">
                    {temp.category}
                  </span>
                  <h4 className="font-display font-bold text-xs text-text-primary mt-1.5 truncate">
                    {temp.name}
                  </h4>
                  <p className="text-[10px] text-text-muted mt-1 truncate">{temp.body}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTemplate(temp.id);
                  }}
                  className="p-1 hover:bg-brand-red/10 text-text-muted hover:text-brand-red rounded transition-colors flex-shrink-0 mt-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor pane */}
        <div className="col-span-2 bg-card-bg border border-card-border rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {selectedTemp === null ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-text-muted space-y-3">
              <div className="w-12 h-12 bg-card-border/50 border border-card-border rounded-2xl flex items-center justify-center text-text-secondary">
                <FileText className="w-6 h-6" />
              </div>
              <p className="font-semibold text-text-primary">No Template Selected</p>
              <p className="max-w-xs">
                Select a message template from the left library list to edit its content and variables.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-background/20">
                <div className="flex bg-card-border/40 p-1 rounded-lg">
                  <button
                    onClick={() => setActivePane('edit')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold font-mono transition-colors flex items-center gap-1.5 ${
                      activePane === 'edit'
                        ? 'bg-card-bg text-brand-red shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>EDITOR</span>
                  </button>
                  <button
                    onClick={() => setActivePane('preview')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold font-mono transition-colors flex items-center gap-1.5 ${
                      activePane === 'preview'
                        ? 'bg-card-bg text-brand-red shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>PREVIEW</span>
                  </button>
                </div>
                <button
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="px-3 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              <div className="flex-1 p-5 overflow-y-auto">
                {activePane === 'edit' ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                          Template Name
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                          Category Tag
                        </label>
                        <input
                          type="text"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                        Channel Route
                      </label>
                      <select
                        value={channel}
                        onChange={(e) => setChannel(e.target.value as Template['channel'])}
                        className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red"
                      >
                        <option value="email">Email</option>
                        <option value="phone">Phone Call</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    </div>

                    {channel === 'email' && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                          Email Subject
                        </label>
                        <input
                          type="text"
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                        />
                      </div>
                    )}

                    {/* A/B Testing — managers only */}
                    {isManager && (
                    <div className="border border-card-border rounded-xl overflow-hidden">
                      <button
                        onClick={() => setAbOpen(!abOpen)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-background/50 hover:bg-background/80 transition-colors"
                      >
                        <span className="text-[10px] font-bold font-mono text-text-muted uppercase flex items-center gap-1.5">
                          <span className="text-xs">A/B</span> Testing
                          {abVariants.length > 0 && (
                            <span className="bg-brand-red/10 text-brand-red text-[8px] font-extrabold px-1.5 py-0.5 rounded-full">
                              {abVariants.length} variant{abVariants.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                        <span className={`text-text-muted transition-transform ${abOpen ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {abOpen && (
                        <div className="p-3 border-t border-card-border space-y-3">
                          <p className="text-[10px] text-text-muted leading-relaxed">
                            Create a B variant to A/B test subject lines and body copy. Variants are randomly assigned to leads when the sequence runs.
                          </p>
                          {abVariants.length === 0 && (
                            <button
                              onClick={handleCreateAbVariant}
                              disabled={creatingAb}
                              className="px-2.5 py-1.5 bg-background border border-card-border hover:border-brand-red text-text-secondary hover:text-brand-red text-[10px] font-semibold rounded-lg transition-colors disabled:opacity-50"
                            >
                              {creatingAb ? 'Creating...' : 'Create B Variant from Current'}
                            </button>
                          )}
                          {abVariants.map((v) => (
                            <div
                              key={v.id}
                              className="bg-background/50 border border-card-border rounded-lg p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold font-mono text-brand-red uppercase">
                                  Variant {v.version}
                                </span>
                                <button
                                  onClick={() => handleRemoveAbVariant(v.id)}
                                  className="p-1 hover:bg-brand-red/10 text-text-muted hover:text-brand-red rounded transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              {v.subject !== null && (
                                <p className="text-[10px] text-text-muted">
                                  <span className="font-semibold">Subject:</span> {v.subject || '(none)'}
                                </p>
                              )}
                              <p className="text-[10px] text-text-muted line-clamp-2">
                                <span className="font-semibold">Body:</span> {v.body || '(none)'}
                              </p>
                              <p className="text-[9px] text-text-muted">
                                Sent: {v.sentCount} | Replies: {v.replyCount}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                          Message Body
                        </label>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <span className="text-[9px] font-mono text-text-muted mr-1 mt-1">
                            Insert:
                          </span>
                          {MERGE_FIELDS.map((f) => (
                            <button
                              key={f}
                              onClick={() => handleInsertMergeField(f)}
                              className="px-1.5 py-0.5 border border-card-border bg-background hover:bg-card-border text-[9px] font-semibold text-text-secondary rounded transition-colors"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full bg-background border border-card-border rounded-xl p-3 text-text-primary focus:outline-none focus:border-brand-red h-48 placeholder-text-muted resize-none leading-relaxed font-mono text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs h-full flex flex-col">
                    <div className="border border-card-border bg-background/30 rounded-xl p-4 flex-1 space-y-4 min-h-[250px]">
                      {channel === 'email' && (
                        <div className="border-b border-card-border/60 pb-3">
                          <p className="text-text-muted">
                            <span className="font-semibold uppercase font-mono text-[10px]">Subject: </span>
                            {applyMergeFields(subject) || '(No Subject)'}
                          </p>
                        </div>
                      )}
                      <div className="text-xs text-text-primary whitespace-pre-line leading-relaxed font-sans">
                        {getPreviewText() || '(Empty Template)'}
                      </div>
                    </div>
                    <div className="bg-brand-red/5 border border-brand-red/10 rounded-xl p-3 text-[10px] text-text-secondary leading-relaxed font-mono flex gap-2">
                      <span className="text-xs">💡</span>
                      <span>
                        Preview shows merge tokens substituted with demo data: Sarah Chen (VP Operations at Acme Corp).
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
