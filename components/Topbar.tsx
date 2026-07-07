'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  Plus,
  Check,
  UserCheck,
  ChevronDown,
  AlarmClock,
  X,
  LogOut,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useAppContext } from '@/context/AppContext';
import { readNotifPrefs, isMuted, NOTIF_PREFS_EVENT } from '@/lib/notifications/prefs';

interface Notification {
  id: string;
  type: string;
  text: string;
  isRead: boolean;
  createdAt: string;
  linkTo?: string;
}

interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  isDismissed: boolean;
  leadId?: string | null;
}

type BellItem =
  | ({ kind: 'notification' } & Notification)
  | ({ kind: 'reminder' } & Reminder);

interface TopbarProps {
  currentRole: 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';
  onRoleChange: (role: 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen') => void;
  onNewAction?: (type: 'lead' | 'task' | 'reminder' | 'campaign') => void;
}

export default function Topbar({ currentRole, onRoleChange, onNewAction }: TopbarProps) {
  const { currentUser } = useAppContext();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ leads: any[]; templates: any[] }>({ leads: [], templates: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBellData = () => {
    fetch('/api/notifications?unreadOnly=true')
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => {});
    fetch('/api/reminders')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setReminders(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    // Check for overdue tasks + due reminders on mount and create notifications
    fetch('/api/notifications/check', { method: 'POST' })
      .then(() => fetchBellData())
      .catch(() => fetchBellData());

    // Notification mute preferences (per-browser); re-read when Settings updates them.
    setNotifPrefs(readNotifPrefs());
    const syncPrefs = () => setNotifPrefs(readNotifPrefs());

    // Avatar (server-persisted); refresh live when the profile is saved in Settings.
    const loadAvatar = () => {
      fetch('/api/settings')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setAvatarUrl(d?.avatarUrl ?? null))
        .catch(() => {});
    };
    loadAvatar();

    window.addEventListener('crm:reminder-created', fetchBellData);
    window.addEventListener('crm:notifications-updated', fetchBellData);
    window.addEventListener(NOTIF_PREFS_EVENT, syncPrefs);
    window.addEventListener('crm:profile-updated', loadAvatar);
    return () => {
      window.removeEventListener('crm:reminder-created', fetchBellData);
      window.removeEventListener('crm:notifications-updated', fetchBellData);
      window.removeEventListener(NOTIF_PREFS_EVENT, syncPrefs);
      window.removeEventListener('crm:profile-updated', loadAvatar);
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults({ leads: [], templates: [] }); return; }
    setSearchLoading(true);
    try {
      const [leadsRes, tplRes] = await Promise.all([
        fetch(`/api/leads?search=${encodeURIComponent(q)}&limit=5`),
        fetch(`/api/templates?search=${encodeURIComponent(q)}`),
      ]);
      const leads = leadsRes.ok ? await leadsRes.json() : [];
      const templates = tplRes.ok ? await tplRes.json() : [];
      setSearchResults({
        leads: (Array.isArray(leads) ? leads : []).slice(0, 5),
        templates: (Array.isArray(templates) ? templates : []).slice(0, 3),
      });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults({ leads: [], templates: [] }); return; }
    searchTimer.current = setTimeout(() => runSearch(searchQuery), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, runSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setSearchOpen(true);
        searchRef.current?.querySelector('input')?.focus();
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, []);

  // Hide notification types the user muted in Settings (always-on events are never muted).
  const visibleNotifications = notifications.filter((n) => !isMuted(n.type, notifPrefs));

  const unreadCount =
    visibleNotifications.filter((n) => !n.isRead).length +
    reminders.filter((r) => !r.isDismissed && new Date(r.dueAt) <= new Date()).length;

  // Unified bell items sorted newest-first (reminders by dueAt, notifications by createdAt)
  const bellItems: BellItem[] = [
    ...visibleNotifications.map((n) => ({ kind: 'notification' as const, ...n })),
    ...reminders.filter((r) => !r.isDismissed).map((r) => ({ kind: 'reminder' as const, ...r })),
  ].sort((a, b) => {
    const aDate = a.kind === 'notification' ? a.createdAt : a.dueAt;
    const bDate = b.kind === 'notification' ? b.createdAt : b.dueAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const handleNotificationClick = (item: Notification) => {
    setBellOpen(false);
    if (!item.linkTo) return;
    // If linkTo is a leads path, fire custom event to open the lead slide-over
    const leadMatch = item.linkTo.match(/\/leads\/([^/?]+)/);
    if (leadMatch) {
      window.dispatchEvent(new CustomEvent('crm:open-lead', { detail: { leadId: leadMatch[1] } }));
      if (!window.location.pathname.includes('/leads')) router.push('/leads');
    } else {
      router.push(item.linkTo);
    }
    // Mark as read
    if (!item.isRead) {
      fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => {});
      setNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, isRead: true } : n));
    }
  };

  const handleDismissNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/notifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleDismissReminder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/reminders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDismissed: true }),
    });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDismissAll = async () => {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications([]);
    await Promise.all(
      reminders.map((r) =>
        fetch(`/api/reminders/${r.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDismissed: true }),
        })
      )
    );
    setReminders([]);
  };

  const handleNewClick = (type: 'lead' | 'task' | 'reminder' | 'campaign') => {
    setPlusOpen(false);
    if (onNewAction) onNewAction(type);
  };

  const displayName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ')
    : currentRole === 'director'
    ? 'Son Nguyen'
    : 'Team Member';

  const displayInitial = (currentUser?.firstName?.[0] ?? displayName[0]).toUpperCase();

  return (
    <header
      className="fixed top-0 right-0 z-10 flex items-center justify-between px-6 py-3 glass-topbar h-16"
      style={{ left: 'var(--sidebar-w, 56px)' }}
    >
      {/* Global Search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search leads, templates… (press /)"
            className="w-full pl-9 pr-10 py-1.5 text-xs bg-background border border-card-border rounded-lg text-text-primary placeholder-text-muted hover:border-brand-red/50 focus:outline-none focus:border-brand-red transition-all"
          />
          {searchQuery ? (
            <button onClick={() => { setSearchQuery(''); setSearchResults({ leads: [], templates: [] }); }} className="absolute inset-y-0 right-2 flex items-center text-text-muted hover:text-text-primary">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-card-border text-text-muted rounded">/</kbd>
            </span>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && searchQuery.trim() && (
          <div className="absolute top-full left-0 right-0 mt-1 glass-card border border-card-border rounded-xl shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
            {searchLoading && (
              <div className="p-4 text-center text-xs text-text-muted font-mono">Searching…</div>
            )}
            {!searchLoading && searchResults.leads.length === 0 && searchResults.templates.length === 0 && (
              <div className="p-4 text-center text-xs text-text-muted">No results for "{searchQuery}"</div>
            )}
            {searchResults.leads.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[9px] font-bold font-mono uppercase text-text-muted bg-background/50 border-b border-card-border">Leads</div>
                {searchResults.leads.map((lead: any) => (
                  <button
                    key={lead.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-red/5 transition-colors flex items-center gap-3 border-b border-card-border/50 last:border-0"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('crm:open-lead', { detail: { leadId: lead.id } }));
                      setSearchOpen(false); setSearchQuery('');
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate">{lead.firstName} {lead.lastName}</p>
                      <p className="text-[10px] text-text-muted truncate font-mono">{lead.company} · {lead.stage?.replace(/_/g, ' ')}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${lead.priority === 'hot' ? 'bg-brand-red/10 text-brand-red' : lead.priority === 'warm' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-card-border text-text-muted'}`}>{lead.priority}</span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.templates.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-[9px] font-bold font-mono uppercase text-text-muted bg-background/50 border-b border-card-border">Templates</div>
                {searchResults.templates.map((tpl: any) => (
                  <button
                    key={tpl.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-red/5 transition-colors flex items-center gap-3 border-b border-card-border/50 last:border-0"
                    onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                  >
                    <p className="text-xs font-semibold text-text-primary truncate">{tpl.name}</p>
                    <span className="text-[9px] font-mono text-text-muted ml-auto">{tpl.channel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Actions */}
      <div className="flex items-center gap-4">
        {/* + New Button */}
        <div className="relative">
          <button
            onClick={() => setPlusOpen(!plusOpen)}
            aria-label="New action menu"
            aria-expanded={plusOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-all duration-150 hover:scale-[1.02] active:scale-[0.97] focus-ring"
          >
            <Plus className="w-4 h-4" />
            <span className="inline">New Action</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {plusOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPlusOpen(false)} />
              <div role="menu" aria-orientation="vertical" className="absolute right-0 mt-2 w-48 bg-card-bg border border-card-border rounded-xl shadow-lg shadow-black/5 z-40 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  role="menuitem"
                  onClick={() => handleNewClick('lead')}
                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-background transition-colors flex items-center gap-2"
                >
                  <span className="text-blue-500">👥</span> New Lead
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleNewClick('task')}
                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-background transition-colors flex items-center gap-2"
                >
                  <span className="text-brand-orange">📋</span> New Task
                </button>
                <button
                  role="menuitem"
                  onClick={() => handleNewClick('reminder')}
                  className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-background transition-colors flex items-center gap-2"
                >
                  <span className="text-brand-gold">🔔</span> New Reminder
                </button>
                {(currentRole === 'director' || currentRole === 'floor_manager') && (
                  <>
                    <div className="my-1 border-t border-card-border" />
                    <button
                      role="menuitem"
                      onClick={() => handleNewClick('campaign')}
                      className="w-full text-left px-4 py-2 text-xs text-text-primary hover:bg-background transition-colors flex items-center gap-2"
                    >
                      <span className="text-emerald-500">🚀</span> New Campaign
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setBellOpen(!bellOpen)}
            aria-label={`Notifications — ${unreadCount} unread`}
            aria-expanded={bellOpen}
            aria-haspopup="dialog"
            className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-card-border/30 rounded-lg transition-colors duration-150 focus-ring"
          >
            <Bell className="w-4 h-4" aria-hidden="true" />
            {unreadCount > 0 && (
              <span aria-live="polite" aria-atomic="true" className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-red border-2 border-topbar-bg text-[9px] font-bold text-white flex items-center justify-center rounded-full animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-card-bg border border-card-border rounded-xl shadow-xl shadow-black/10 z-40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between px-4 py-3 border-b border-card-border bg-background/50">
                  <span className="font-display font-bold text-xs text-text-primary flex items-center gap-1.5">
                    <span>🔔</span> Notifications &amp; Reminders
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleDismissAll}
                      className="text-[10px] text-brand-red hover:underline font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-card-border">
                  {bellItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-text-muted">
                      All caught up — no notifications or reminders.
                    </div>
                  ) : (
                    bellItems.map((item) => {
                      if (item.kind === 'reminder') {
                        const isOverdue = new Date(item.dueAt) < new Date();
                        return (
                          <div key={`rem-${item.id}`} className={`p-3 text-xs flex items-start gap-2.5 hover:bg-background/80 relative ${isOverdue ? 'bg-brand-gold/[0.03]' : ''}`}>
                            <AlarmClock className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isOverdue ? 'text-brand-gold' : 'text-text-muted'}`} aria-hidden="true" />
                            <div className="flex-1 min-w-0 pr-6">
                              <p className="text-text-secondary text-[11px] leading-normal">{item.text}</p>
                              <span className={`text-[9px] mt-1 inline-block font-mono ${isOverdue ? 'text-brand-gold' : 'text-text-muted'}`}>
                                {isOverdue ? '⚠ overdue · ' : ''}
                                {new Date(item.dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                                {new Date(item.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <button
                              onClick={(e) => handleDismissReminder(item.id, e)}
                              title="Dismiss reminder"
                              className="absolute right-2 top-3 w-5 h-5 flex items-center justify-center bg-card-border hover:bg-brand-red/10 hover:text-brand-red text-text-muted rounded-full transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      }
                      // Notification
                      return (
                        <div
                          key={`notif-${item.id}`}
                          onClick={() => handleNotificationClick(item)}
                          className={`p-3 text-xs transition-colors hover:bg-background/80 relative flex items-start gap-2.5 ${item.linkTo ? 'cursor-pointer' : ''} ${!item.isRead ? 'bg-brand-red/[0.02]' : ''}`}
                        >
                          <span className="mt-0.5 text-base flex-shrink-0">
                            {item.type === 'meeting_booked' ? '🎉' : item.type === 'overdue_tasks' ? '⚠️' : item.type === 'lead_reply' ? '📧' : '🔔'}
                          </span>
                          <div className="flex-1 min-w-0 pr-6">
                            <p className="text-text-secondary text-[11px] leading-normal">{item.text}</p>
                            <span className="text-[9px] text-text-muted mt-1 inline-block font-mono">
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <button
                            onClick={(e) => handleDismissNotification(item.id, e)}
                            title="Dismiss"
                            className="absolute right-2 top-3 w-5 h-5 flex items-center justify-center bg-card-border hover:bg-brand-red/10 hover:text-brand-red text-text-muted rounded-full transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Persona / User Menu */}
        <div className="relative border-l border-topbar-border pl-4">
          <button
            onClick={() => setPersonaOpen(!personaOpen)}
            aria-label={`User menu — ${displayName}, ${currentRole}`}
            aria-expanded={personaOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 hover:bg-card-border/30 px-2 py-1.5 rounded-lg transition-colors duration-150 focus-ring"
          >
            <div className="w-7 h-7 rounded-full bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center text-xs font-bold text-brand-orange uppercase overflow-hidden">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                displayInitial
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-text-primary leading-tight">{displayName}</span>
              <span className="text-[10px] text-text-muted leading-tight font-mono capitalize">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          </button>

          {personaOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPersonaOpen(false)} />
              <div role="menu" aria-orientation="vertical" className="absolute right-0 mt-2 w-56 bg-card-bg border border-card-border rounded-xl shadow-xl shadow-black/10 z-40 py-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                {process.env.NODE_ENV !== 'production' && (
                  <>
                    <div className="px-4 py-2 border-b border-card-border bg-background/30 mb-1">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted block">
                        Simulate Role (Showcase)
                      </span>
                      <p className="text-[11px] text-text-secondary leading-normal mt-0.5">
                        Test how the interface adapts to different access scopes.
                      </p>
                      <p className="text-[9px] text-brand-orange leading-normal mt-1 italic font-medium">
                        ⚠️ UI simulation only — server permissions unchanged.
                      </p>
                    </div>
                    {(
                      [
                        { role: 'sdr', label: 'SDR View', icon: '👤' },
                        { role: 'team_lead', label: 'Team Lead View', icon: '🎯' },
                        { role: 'floor_manager', label: 'Floor Manager View', icon: '🏢' },
                        { role: 'director', label: 'Director View', icon: '👑' },
                      ] as const
                    ).map(({ role, label, icon }) => (
                      <button
                        key={role}
                        role="menuitem"
                        onClick={() => { onRoleChange(role); setPersonaOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors flex items-center justify-between ${
                          currentRole === role
                            ? 'text-brand-red font-semibold bg-brand-red/5'
                            : 'text-text-primary hover:bg-background'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <UserCheck className="w-3.5 h-3.5 text-brand-orange" aria-hidden="true" /> {icon} {label}
                        </span>
                        {currentRole === role && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      </button>
                    ))}
                    <div className="my-1 border-t border-card-border" />
                  </>
                )}
                <button
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full text-left px-4 py-2 text-xs text-brand-red hover:bg-brand-red/5 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
