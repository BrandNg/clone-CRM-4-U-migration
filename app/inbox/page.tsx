'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail,
  Send,
  Trash2,
  AlertTriangle,
  Loader2,
  Search,
  CheckCircle,
  Inbox,
  Clock,
  Bold,
  Italic,
  Underline,
  List,
  Reply,
  Check,
  X,
  FileText,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

interface Message {
  id: string;
  type: 'inbound' | 'outbound';
  fromEmail: string;
  fromName: string | null;
  to: string;
  subject: string;
  body: string | null;
  bodyHtml: string | null;
  providerMessageId: string;
  date: string;
  isRead: boolean;
  isSpam: boolean;
  isTrash: boolean;
}

interface Thread {
  id: string;
  subject: string;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
  } | null;
  messages: Message[];
  latestMessageAt: string;
  isRead: boolean;
  folder: string;
}

export default function InboxPage() {
  const { showToast } = useToast();
  const [folder, setFolder] = useState<'inbox' | 'sent' | 'spam' | 'trash'>('inbox');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Reply box states
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const replyEditorRef = useRef<HTMLDivElement>(null);

  // Load threads
  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox?folder=${folder}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data);
        
        // Auto-select first thread if none is selected
        if (data.length > 0 && !selectedThread) {
          // Find if we had a previously selected thread to preserve selection
          setSelectedThread(data[0]);
        } else if (selectedThread) {
          // Update selected thread content from new data
          const updated = data.find((t: Thread) => t.id === selectedThread.id);
          setSelectedThread(updated || null);
        } else {
          setSelectedThread(null);
        }
      } else {
        showToast('Failed to load inbox threads', 'error');
      }
    } catch {
      showToast('Network error loading inbox', 'error');
    } finally {
      setLoading(false);
    }
  }, [folder, selectedThread, showToast]);

  useEffect(() => {
    loadThreads();
  }, [folder]);

  // Mark selected thread as read if unread
  useEffect(() => {
    if (selectedThread && !selectedThread.isRead) {
      const unreadInboundIds = selectedThread.messages
        .filter((m) => m.type === 'inbound' && !m.isRead)
        .map((m) => m.id);

      if (unreadInboundIds.length > 0) {
        fetch('/api/inbox', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageIds: unreadInboundIds, action: 'read' }),
        }).then((res) => {
          if (res.ok) {
            // Update local state
            setThreads((prev) =>
              prev.map((t) =>
                t.id === selectedThread.id
                  ? {
                      ...t,
                      isRead: true,
                      messages: t.messages.map((m) =>
                        unreadInboundIds.includes(m.id) ? { ...m, isRead: true } : m
                      ),
                    }
                  : t
              )
            );
            setSelectedThread((prev) =>
              prev
                ? {
                    ...prev,
                    isRead: true,
                    messages: prev.messages.map((m) =>
                      unreadInboundIds.includes(m.id) ? { ...m, isRead: true } : m
                    ),
                  }
                : null
            );
          }
        });
      }
    }
  }, [selectedThread]);

  // Handle actions (archive/trash/spam)
  const handleBulkAction = async (action: 'read' | 'unread' | 'spam' | 'trash' | 'delete', thread: Thread) => {
    const inboundIds = thread.messages.filter((m) => m.type === 'inbound').map((m) => m.id);
    if (inboundIds.length === 0 && action !== 'delete') {
      showToast('Only received messages can be updated in folder states', 'info');
      return;
    }

    try {
      const res = await fetch('/api/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageIds: action === 'delete' ? thread.messages.map((m) => m.id) : inboundIds,
          action,
        }),
      });

      if (res.ok) {
        showToast(`Conversation moved to ${action}`, 'success');
        
        // Remove from list
        setThreads((prev) => prev.filter((t) => t.id !== thread.id));
        if (selectedThread?.id === thread.id) {
          setSelectedThread(null);
        }
      } else {
        showToast('Failed to apply folder action', 'error');
      }
    } catch {
      showToast('Network error applying folder action', 'error');
    }
  };

  // Handle sending reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThread || !replyBody.trim()) return;

    setSendingReply(true);
    try {
      const res = await fetch(`/api/inbox/threads/${selectedThread.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: replyBody,
          subject: selectedThread.subject,
          leadId: selectedThread.lead?.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast('Reply sent successfully!', 'success');
        
        // Clear editor
        setReplyBody('');
        if (replyEditorRef.current) replyEditorRef.current.innerHTML = '';
        
        // Update thread local state
        const updatedMessages = [...selectedThread.messages, data.outboundMessage];
        setSelectedThread({ ...selectedThread, messages: updatedMessages });
        setThreads((prev) =>
          prev.map((t) =>
            t.id === selectedThread.id ? { ...t, messages: updatedMessages, latestMessageAt: data.outboundMessage.date } : t
          )
        );
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to send reply', 'error');
      }
    } catch {
      showToast('Network error sending reply', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const execReplyCommand = (command: string, value: string = '') => {
    if (replyEditorRef.current) {
      replyEditorRef.current.focus();
      document.execCommand(command, false, value);
      setReplyBody(replyEditorRef.current.innerHTML);
    }
  };

  // Filter threads by search query
  const filteredThreads = threads.filter((t) => {
    const query = searchQuery.toLowerCase();
    const matchesLead = t.lead
      ? `${t.lead.firstName} ${t.lead.lastName} ${t.lead.company}`.toLowerCase().includes(query)
      : false;
    const matchesSubject = t.subject.toLowerCase().includes(query);
    const matchesBody = t.messages.some((m) => m.body?.toLowerCase().includes(query));
    return query === '' || matchesLead || matchesSubject || matchesBody;
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-[#fafafa]">
      {/* Search Header */}
      <div className="h-14 border-b border-card-border bg-white px-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-text-primary">Unified Inbox</span>
          <span className="text-[10px] bg-brand-red/10 border border-brand-red/20 text-brand-red font-mono px-2 py-0.5 rounded-full uppercase font-bold">
            Live
          </span>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f4f4f4] border border-card-border rounded-xl pl-9 pr-4 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-red transition-all"
          />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* COLUMN 1: Folder Navigation Folders */}
        <div className="w-48 border-r border-card-border bg-white p-3 space-y-1.5 select-none text-left">
          <button
            onClick={() => setFolder('inbox')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              folder === 'inbox'
                ? 'bg-brand-red/10 text-brand-red font-bold'
                : 'text-text-secondary hover:bg-[#f5f5f5] hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              <span>Inbox</span>
            </div>
            {threads.filter((t) => !t.isRead && t.folder === 'inbox').length > 0 && (
              <span className="px-1.5 py-0.5 bg-brand-red text-white text-[9px] font-bold rounded-full font-mono">
                {threads.filter((t) => !t.isRead && t.folder === 'inbox').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setFolder('sent')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              folder === 'sent'
                ? 'bg-brand-red/10 text-brand-red font-bold'
                : 'text-text-secondary hover:bg-[#f5f5f5] hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>Sent</span>
            </div>
          </button>

          <button
            onClick={() => setFolder('spam')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              folder === 'spam'
                ? 'bg-brand-red/10 text-brand-red font-bold'
                : 'text-text-secondary hover:bg-[#f5f5f5] hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Spam</span>
            </div>
          </button>

          <button
            onClick={() => setFolder('trash')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              folder === 'trash'
                ? 'bg-brand-red/10 text-brand-red font-bold'
                : 'text-text-secondary hover:bg-[#f5f5f5] hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              <span>Trash</span>
            </div>
          </button>
        </div>

        {/* COLUMN 2: Message Thread List */}
        <div className="w-80 border-r border-card-border bg-white flex flex-col overflow-y-auto">
          {loading && threads.length === 0 ? (
            <div className="flex-1 flex justify-center items-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center items-center p-8 text-center text-text-muted space-y-1">
              <span className="text-2xl">📥</span>
              <p className="text-xs font-semibold">No messages in this folder.</p>
              <p className="text-[10px] text-text-muted">All caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-card-border">
              {filteredThreads.map((thread) => {
                const isSelected = selectedThread?.id === thread.id;
                const latestMsg = thread.messages[thread.messages.length - 1];
                return (
                  <div
                    key={thread.id}
                    onClick={() => setSelectedThread(thread)}
                    className={`p-3.5 cursor-pointer text-left transition-all relative border-l-2 ${
                      isSelected
                        ? 'bg-brand-red/[0.03] border-brand-red'
                        : 'hover:bg-[#fafafa] border-transparent'
                    }`}
                  >
                    {/* Unread dot indicator */}
                    {!thread.isRead && (
                      <span className="absolute right-3.5 top-4 w-2 h-2 rounded-full bg-brand-red" />
                    )}

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between items-start pr-4">
                        <span className={`font-semibold truncate max-w-[130px] ${!thread.isRead ? 'text-text-primary font-bold' : 'text-text-secondary'}`}>
                          {thread.lead ? `${thread.lead.firstName} ${thread.lead.lastName}` : latestMsg?.fromName || latestMsg?.fromEmail}
                        </span>
                        <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">
                          {new Date(thread.latestMessageAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className={`truncate font-medium text-text-primary ${!thread.isRead ? 'font-bold' : ''}`}>
                        {thread.subject}
                      </p>
                      <p className="text-text-muted truncate text-[10px] pr-2">
                        {latestMsg?.body || '(Empty email body)'}
                      </p>
                      {thread.lead && (
                        <span className="text-[9px] font-semibold text-brand-orange border border-brand-orange/20 bg-brand-orange/5 px-1.5 py-0.5 rounded font-mono block w-fit mt-1">
                          {thread.lead.company}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* COLUMN 3: Reading Pane & Reply Composer */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden">
          {selectedThread ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="h-12 border-b border-card-border px-5 flex items-center justify-between bg-[#fafafa]">
                <div className="flex items-center gap-1">
                  {folder !== 'trash' && (
                    <button
                      onClick={() => handleBulkAction('trash', selectedThread)}
                      className="p-1.5 hover:bg-card-border/50 text-text-muted hover:text-brand-red rounded transition-colors"
                      title="Move to Trash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {folder !== 'spam' && (
                    <button
                      onClick={() => handleBulkAction('spam', selectedThread)}
                      className="p-1.5 hover:bg-card-border/50 text-text-muted hover:text-brand-orange rounded transition-colors"
                      title="Mark as Spam"
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  )}
                  {!selectedThread.isRead ? (
                    <button
                      onClick={() => handleBulkAction('read', selectedThread)}
                      className="p-1.5 hover:bg-card-border/50 text-text-muted hover:text-text-primary rounded transition-colors"
                      title="Mark as Read"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBulkAction('unread', selectedThread)}
                      className="p-1.5 hover:bg-card-border/50 text-text-muted hover:text-text-primary rounded transition-colors"
                      title="Mark as Unread"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {selectedThread.lead && (
                  <Link
                    href={`/leads/${selectedThread.lead.id}`}
                    className="text-[10px] font-bold font-mono text-brand-red hover:underline uppercase"
                  >
                    View Lead Profile →
                  </Link>
                )}
              </div>

              {/* Thread Messages Timeline */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafafa]/50 text-left">
                <div className="pb-3 border-b border-card-border">
                  <h2 className="text-sm font-bold text-text-primary">{selectedThread.subject}</h2>
                </div>

                <div className="space-y-4">
                  {selectedThread.messages.map((msg) => {
                    const isOutbound = msg.type === 'outbound';
                    return (
                      <div
                        key={msg.id}
                        className={`p-4 border rounded-2xl shadow-sm max-w-2xl text-xs space-y-3 ${
                          isOutbound
                            ? 'bg-white border-card-border ml-auto text-right'
                            : 'bg-white border-card-border'
                        }`}
                      >
                        <div className={`flex justify-between items-start gap-4 ${isOutbound ? 'flex-row-reverse text-right' : ''}`}>
                          <div className="min-w-0">
                            <p className="font-bold text-text-primary truncate">
                              {isOutbound ? 'Me' : msg.fromName || msg.fromEmail}
                            </p>
                            <p className="text-[10px] text-text-muted truncate mt-0.5">
                              {isOutbound ? `To: ${msg.to}` : `From: ${msg.fromEmail}`}
                            </p>
                          </div>
                          <span className="text-[9px] text-text-muted font-mono whitespace-nowrap">
                            {new Date(msg.date).toLocaleString()}
                          </span>
                        </div>

                        {/* Email Body Content */}
                        {msg.bodyHtml ? (
                          <div
                            className={`text-xs text-text-primary leading-relaxed font-sans select-text border-t border-card-border/40 pt-3 text-left ql-editor`}
                            dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                          />
                        ) : (
                          <div className="text-xs text-text-primary whitespace-pre-wrap leading-relaxed font-sans border-t border-card-border/40 pt-3 text-left select-text">
                            {msg.body || '(Empty email body)'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reply Composer Editor */}
              {selectedThread.lead ? (
                <form onSubmit={handleSendReply} className="border-t border-card-border p-4 bg-white space-y-3">
                  <div className="flex items-center justify-between text-left">
                    <span className="text-[10px] font-bold font-mono text-text-muted uppercase flex items-center gap-1">
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply to {selectedThread.lead.firstName}</span>
                    </span>
                    
                    {/* Rich text formatting toolbar */}
                    <div className="flex items-center gap-0.5 bg-[#f5f5f5] border border-card-border rounded-lg p-0.5">
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); execReplyCommand('bold'); }}
                        className="p-1 hover:bg-card-border/50 text-text-secondary hover:text-text-primary rounded text-xs"
                        title="Bold"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); execReplyCommand('italic'); }}
                        className="p-1 hover:bg-card-border/50 text-text-secondary hover:text-text-primary rounded text-xs"
                        title="Italic"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); execReplyCommand('underline'); }}
                        className="p-1 hover:bg-card-border/50 text-text-secondary hover:text-text-primary rounded text-xs"
                        title="Underline"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); execReplyCommand('insertUnorderedList'); }}
                        className="p-1 hover:bg-card-border/50 text-text-secondary hover:text-text-primary rounded text-xs"
                        title="Bullet List"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <div
                      ref={replyEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => setReplyBody(e.currentTarget.innerHTML)}
                      className="w-full bg-background border border-card-border rounded-xl p-3 text-text-primary text-xs focus:outline-none focus:border-brand-red min-h-[5rem] max-h-36 overflow-y-auto leading-relaxed text-left focus:ring-1 focus:ring-brand-red/35 outline-none font-sans empty-placeholder"
                      data-placeholder="Type your reply here..."
                      style={{ minHeight: '5rem' }}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="submit"
                      disabled={sendingReply || !replyBody.trim()}
                      className="px-4 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-60 shadow-sm"
                    >
                      {sendingReply ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Send Reply</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="border-t border-card-border p-4 bg-white text-center text-xs text-text-muted italic">
                  Cannot reply: Thread is not linked to an active CRM lead.
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center text-text-muted space-y-2 p-8">
              <span className="text-3xl">📭</span>
              <p className="text-xs font-semibold">No Conversation Selected</p>
              <p className="text-[10px] text-text-muted">Select a thread from the list to view the full dialogue history.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
