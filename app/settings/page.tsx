'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Mail,
  Key,
  Globe,
  ShieldAlert,
  Trash2,
  RefreshCw,
  Loader2,
  Users,
  Download,
  Plus,
  X,
  Bell,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import TeamAccountsPanel from '@/components/settings/TeamAccountsPanel';
import { NOTIF_EVENTS, NOTIF_PREFS_KEY, NOTIF_PREFS_EVENT, readNotifPrefs } from '@/lib/notifications/prefs';
import { readApiError } from '@/lib/api/client';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  isActive: boolean;
}

// useSearchParams() requires a Suspense boundary for static prerendering
export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { currentRole, currentUser } = useAppContext();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [providerStatus, setProviderStatus] = useState<{ gmail: boolean; outlook: boolean } | null>(null);

  useEffect(() => {
    const error = searchParams.get('error');
    const success = searchParams.get('success');

    if (error === 'google_not_configured') {
      showToast('Gmail OAuth not configured — credentials missing in .env.local', 'error');
    } else if (error === 'microsoft_not_configured') {
      showToast('Outlook OAuth not configured — credentials missing in .env.local', 'error');
    } else if (error === 'google_auth_failed') {
      showToast('Google OAuth failed — check your Client ID, Secret, and redirect URI', 'error');
    } else if (error === 'google_invalid_state') {
      showToast('Google OAuth state mismatch — please try connecting again', 'error');
    } else if (error === 'google_token_exchange_failed') {
      showToast('Google token exchange failed — check your OAuth credentials', 'error');
    } else if (error === 'microsoft_auth_failed') {
      showToast('Microsoft OAuth failed — check your credentials and redirect URI', 'error');
    } else if (error === 'microsoft_invalid_state') {
      showToast('Microsoft OAuth state mismatch — please try connecting again', 'error');
    } else if (error === 'microsoft_token_exchange_failed') {
      showToast('Microsoft token exchange failed — check your OAuth credentials', 'error');
    } else if (success === 'gmail_connected') {
      showToast('Gmail connected successfully!', 'success');
    } else if (success === 'outlook_connected') {
      showToast('Outlook connected successfully!', 'success');
    }

    // Clean up URL params so they don't persist on refresh
    if (error || success) {
      router.replace('/settings');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('Asia/Ho_Chi_Minh');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [connectedEmails, setConnectedEmails] = useState<EmailAccount[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [imapServer, setImapServer] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [mailPassword, setMailPassword] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // Admin state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminClients, setAdminClients] = useState<any[]>([]);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFirst, setNewUserFirst] = useState('');
  const [newUserLast, setNewUserLast] = useState('');
  const [newUserRole, setNewUserRole] = useState('sdr');
  const [savingUser, setSavingUser] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  // Edit-user state (Admin → User Management)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editRole, setEditRole] = useState('sdr');
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  // Campaign management state (Admin → Campaigns)
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);
  const [showNewCampaignForm, setShowNewCampaignForm] = useState(false);
  const [campName, setCampName] = useState('');
  const [campClientId, setCampClientId] = useState('');
  const [campNewClient, setCampNewClient] = useState('');
  const [campVertical, setCampVertical] = useState('');
  const [campGeo, setCampGeo] = useState('');
  const [campStatus, setCampStatus] = useState('active');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editCampName, setEditCampName] = useState('');
  const [editCampStatus, setEditCampStatus] = useState('active');
  const [editCampVertical, setEditCampVertical] = useState('');
  const [editCampGeo, setEditCampGeo] = useState('');
  const [savingCampaignEdit, setSavingCampaignEdit] = useState(false);
  // Notification prefs — persisted to localStorage, consumed by the Topbar bell (NOTIF_EVENTS shared).
  const [defaultLeadView, setDefaultLeadView] = useState<'kanban' | 'table'>('kanban');
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const savedView = localStorage.getItem('crm:defaultLeadView');
    if (savedView === 'kanban' || savedView === 'table') setDefaultLeadView(savedView);

    const savedItems = parseInt(localStorage.getItem('crm:itemsPerPage') ?? '25', 10);
    if ([25, 50, 100].includes(savedItems)) setItemsPerPage(savedItems);

    setNotifPrefs(readNotifPrefs());
  }, []);
  const isNotifEnabled = (key: string) => notifPrefs[key] !== false;
  const toggleNotif = (key: string, always: boolean) => {
    if (always) return;
    setNotifPrefs((prev) => {
      const next = { ...prev, [key]: !isNotifEnabled(key) };
      if (typeof window !== 'undefined') {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(NOTIF_PREFS_EVENT));
      }
      return next;
    });
  };

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setProfileFirstName(data.firstName ?? '');
          setProfileLastName(data.lastName ?? '');
          setProfileTimezone(data.timezone ?? 'Asia/Ho_Chi_Minh');
          setProfileAvatarUrl(data.avatarUrl ?? '');
        }
      })
      .catch(() => {});

    fetch('/api/email/accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setConnectedEmails(Array.isArray(data) ? data : []))
      .catch(() => showToast('Failed to load connected email accounts', 'error'));

    fetch('/api/email/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setProviderStatus(data); })
      .catch(() => {});
  }, [showToast]);

  useEffect(() => {
    if (currentRole !== 'director') return;
    fetch('/api/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAdminUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAdminClients(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch('/api/campaigns?type=clients')
      .then((r) => (r.ok ? r.json() : { clients: [] }))
      .then((data) => setClientOptions(Array.isArray(data?.clients) ? data.clients : []))
      .catch(() => {});
  }, [currentRole]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: profileFirstName, lastName: profileLastName, timezone: profileTimezone, avatarUrl: profileAvatarUrl }),
    });
    setIsSavingProfile(false);
    if (res.ok) {
      // Let the Topbar avatar update without a reload.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('crm:profile-updated'));
      showToast('Profile updated successfully!', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to update profile'), 'error');
    }
  };

  const handleConnectGmail = () => {
    const authUrl = `/api/email/oauth/google`;
    showToast('Redirecting to Google OAuth...', 'info');
    window.location.href = authUrl;
  };

  const handleConnectOutlook = () => {
    const authUrl = `/api/email/oauth/microsoft`;
    showToast('Redirecting to Microsoft OAuth...', 'info');
    window.location.href = authUrl;
  };

  const handleConnectManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    const res = await fetch('/api/email/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'imap_smtp',
        email: manualEmail,
        imapHost: imapServer,
        imapPort: parseInt(imapPort),
        smtpHost: smtpServer,
        smtpPort: parseInt(smtpPort),
        password: mailPassword,
      }),
    });
    setIsConnecting(false);
    if (res.ok) {
      const created = await res.json();
      setConnectedEmails((prev) => [...prev, created]);
      setShowManualForm(false);
      setManualEmail('');
      setImapServer('');
      setImapPort('993');
      setSmtpServer('');
      setSmtpPort('465');
      setMailPassword('');
      showToast(`IMAP/SMTP connected for ${created.email}`, 'success');
    } else {
      showToast(await readApiError(res, 'Failed to connect IMAP account'), 'error');
    }
  };

  const handleDeleteEmail = async (id: string) => {
    const target = connectedEmails.find((e) => e.id === id);
    const res = await fetch(`/api/email/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setConnectedEmails((prev) => prev.filter((e) => e.id !== id));
      if (target) showToast(`Disconnected ${target.email}`, 'info');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setIsChangingPassword(true);
    const res = await fetch('/api/settings/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setIsChangingPassword(false);
    if (res.ok) {
      showToast('Password updated', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      showToast(await readApiError(res, 'Failed to change password'), 'error');
    }
  };

  const providerLabel = (provider: string) => {
    switch (provider) {
      case 'gmail': return 'Gmail (OAuth)';
      case 'outlook': return 'Outlook / Exchange';
      case 'imap_smtp': return 'IMAP/SMTP (Roundcube)';
      default: return provider;
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserFirst || !newUserLast) return;
    setSavingUser(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newUserEmail, firstName: newUserFirst, lastName: newUserLast, role: newUserRole, password: 'Telestar2026!' }),
    });
    setSavingUser(false);
    if (res.ok) {
      const created = await res.json();
      setAdminUsers((prev) => [...prev, created]);
      setNewUserEmail(''); setNewUserFirst(''); setNewUserLast(''); setNewUserRole('sdr');
      setShowNewUserForm(false);
      showToast(`User ${newUserFirst} created. Temp password: Telestar2026!`, 'success');
    } else {
      showToast(await readApiError(res, 'Failed to create user'), 'error');
    }
  };

  const handleDeactivateUser = async (userId: string, name: string) => {
    if (!window.confirm(`Deactivate ${name}? They won't be able to log in.`)) return;
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    });
    if (res.ok) {
      setAdminUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: false } : u));
      showToast(`${name} deactivated`, 'info');
    } else {
      showToast(await readApiError(res, 'Failed to deactivate user'), 'error');
    }
  };

  const handleStartEditUser = (u: any) => {
    setEditingUserId(u.id);
    setEditFirst(u.firstName ?? '');
    setEditLast(u.lastName ?? '');
    setEditRole(u.role ?? 'sdr');
    setEditPassword('');
  };

  const handleSaveEditUser = async (userId: string) => {
    if (!editFirst.trim() || !editLast.trim()) {
      showToast('First and last name are required', 'error');
      return;
    }
    if (editPassword && editPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error');
      return;
    }
    setSavingEdit(true);
    const body: Record<string, unknown> = { firstName: editFirst.trim(), lastName: editLast.trim(), role: editRole };
    if (editPassword) body.newPassword = editPassword;
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSavingEdit(false);
    if (res.ok) {
      const updated = await res.json();
      setAdminUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      setEditingUserId(null);
      showToast(editPassword ? 'User updated & password reset' : 'User updated', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to update user'), 'error');
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim()) return;
    if (!campClientId && !campNewClient.trim()) {
      showToast('Select a client or enter a new client name', 'error');
      return;
    }
    setSavingCampaign(true);
    const body: Record<string, unknown> = {
      name: campName.trim(),
      status: campStatus,
      targetVertical: campVertical || undefined,
      targetGeo: campGeo || undefined,
    };
    if (campClientId) body.clientId = campClientId;
    else body.newClientName = campNewClient.trim();
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSavingCampaign(false);
    if (res.ok) {
      const created = await res.json();
      setAdminClients((prev) => [created, ...prev]);
      setCampName(''); setCampClientId(''); setCampNewClient(''); setCampVertical(''); setCampGeo(''); setCampStatus('active');
      setShowNewCampaignForm(false);
      showToast(`Campaign "${created.name}" created`, 'success');
    } else {
      showToast(await readApiError(res, 'Failed to create campaign'), 'error');
    }
  };

  const handleStartEditCampaign = (c: any) => {
    setEditingCampaignId(c.id);
    setEditCampName(c.name ?? '');
    setEditCampStatus(c.status ?? 'active');
    setEditCampVertical(c.targetVertical ?? '');
    setEditCampGeo(c.targetGeo ?? '');
  };

  const handleSaveEditCampaign = async (id: string) => {
    if (!editCampName.trim()) {
      showToast('Campaign name is required', 'error');
      return;
    }
    setSavingCampaignEdit(true);
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editCampName.trim(), status: editCampStatus, targetVertical: editCampVertical || null, targetGeo: editCampGeo || null }),
    });
    setSavingCampaignEdit(false);
    if (res.ok) {
      const updated = await res.json();
      setAdminClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      setEditingCampaignId(null);
      showToast('Campaign updated', 'success');
    } else {
      showToast(await readApiError(res, 'Failed to update campaign'), 'error');
    }
  };

  const handleExportAllData = async () => {
    setExportingData(true);
    try {
      const res = await fetch('/api/leads?limit=9999');
      const allLeads = res.ok ? await res.json() : [];
      // Date-range filter on createdAt (inclusive). An empty bound is open-ended.
      const fromTs = exportFrom ? new Date(`${exportFrom}T00:00:00`).getTime() : null;
      const toTs = exportTo ? new Date(`${exportTo}T23:59:59.999`).getTime() : null;
      const leads = (Array.isArray(allLeads) ? allLeads : []).filter((l: any) => {
        if (!l.createdAt) return fromTs === null && toTs === null;
        const t = new Date(l.createdAt).getTime();
        if (fromTs !== null && t < fromTs) return false;
        if (toTs !== null && t > toTs) return false;
        return true;
      });

      const stamp = new Date().toISOString().slice(0, 10);
      let blob: Blob;
      let filename: string;
      if (exportFormat === 'json') {
        blob = new Blob([JSON.stringify(leads, null, 2)], { type: 'application/json;charset=utf-8;' });
        filename = `telestar-leads-${stamp}.json`;
      } else {
        const rows = [
          ['ID', 'First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'Stage', 'Priority', 'Assigned To', 'Campaign', 'Source', 'Tags', 'Created'],
          ...leads.map((l: any) => [
            l.id, l.firstName, l.lastName, l.company, l.title ?? '', l.email ?? '', l.phone ?? '',
            l.stage, l.priority, `${l.assignedTo?.firstName ?? ''} ${l.assignedTo?.lastName ?? ''}`.trim(),
            l.campaign?.name ?? '', l.source ?? '', (l.tags ?? []).join(';'), l.createdAt?.slice(0, 10) ?? '',
          ]),
        ];
        const csv = rows.map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        filename = `telestar-leads-${stamp}.csv`;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${leads.length} leads (${exportFormat.toUpperCase()})`, 'success');
    } finally {
      setExportingData(false);
    }
  };

  return (
    <div className="space-y-6 flex-1 flex flex-col animate-in fade-in duration-200">
      <div>
        <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
          Workspace Settings
        </h1>
        <p className="text-xs text-text-secondary mt-0.5">
          Configure profile settings, connect campaign email servers, and manage user pods.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 items-start">
        {/* Personal Profile & Email Connections */}
        <div className="col-span-2 space-y-6">
          {/* Profile Card */}
          <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-orange" />
              <span>Personal Profile</span>
            </h3>
            <div className="flex items-center gap-3">
              {profileAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileAvatarUrl} alt="Your avatar" className="w-12 h-12 rounded-full object-cover border border-card-border flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {(profileFirstName?.[0] ?? currentUser?.email?.[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="flex-1 space-y-1 text-xs">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Avatar URL</label>
                <input
                  type="url"
                  value={profileAvatarUrl}
                  onChange={(e) => setProfileAvatarUrl(e.target.value)}
                  placeholder="https://…/avatar.png  (leave blank to use initials)"
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                  First Name
                </label>
                <input
                  type="text"
                  value={profileFirstName}
                  onChange={(e) => setProfileFirstName(e.target.value)}
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                  Last Name
                </label>
                <input
                  type="text"
                  value={profileLastName}
                  onChange={(e) => setProfileLastName(e.target.value)}
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                  Work Email
                </label>
                <input
                  type="email"
                  defaultValue={currentUser?.email ?? ''}
                  disabled
                  className="w-full bg-card-border/30 border border-transparent rounded-lg px-2.5 py-1.5 text-text-muted cursor-not-allowed font-medium"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                  Timezone
                </label>
                <select
                  value={profileTimezone}
                  onChange={(e) => setProfileTimezone(e.target.value)}
                  className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none"
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh (GMT+7)</option>
                  <option value="Europe/London">Europe/London (GMT+1)</option>
                  <option value="America/New_York">America/New York (GMT-5)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60"
              >
                {isSavingProfile && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                Save Profile
              </button>
            </div>
          </div>

          {/* Display Preferences */}
          <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Display Preferences</span>
            </h3>
            <div className="space-y-4 text-xs">
              {/* Default pipeline view */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-text-primary">Default Pipeline View</p>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">Saved to this browser</p>
                </div>
                <div className="flex bg-card-border rounded-lg p-0.5 gap-0.5">
                  {(['kanban', 'table'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setDefaultLeadView(mode);
                        if (typeof window !== 'undefined') localStorage.setItem('crm:defaultLeadView', mode);
                      }}
                      className={`px-3 py-1 rounded text-[10px] font-bold font-mono capitalize transition-all ${defaultLeadView === mode ? 'bg-brand-red text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items per page */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-text-primary">Leads Per Page</p>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">Table view row limit</p>
                </div>
                <div className="flex bg-card-border rounded-lg p-0.5 gap-0.5">
                  {([25, 50, 100] as const).map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setItemsPerPage(n);
                        if (typeof window !== 'undefined') localStorage.setItem('crm:itemsPerPage', String(n));
                      }}
                      className={`px-3 py-1 rounded text-[10px] font-bold font-mono transition-all ${itemsPerPage === n ? 'bg-brand-red text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[10px] text-text-muted font-mono border-t border-card-border/50 pt-3">
                Telestar uses a single light theme, tuned for speed and all-day readability.
              </p>
            </div>
          </div>

          {/* Security — Change Password */}
          <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-orange" />
              <span>Security</span>
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Current Password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">New Password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8+ characters"
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">Confirm New Password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-60"
                >
                  {isChangingPassword && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* Email Account Connections */}
          <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <span>Email Accounts Integration</span>
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Connect the campaign-specific mail servers. Supports Google OAuth, Microsoft Graph,
              and legacy IMAP/SMTP (Roundcube).
            </p>

            <div className="space-y-2.5">
              {connectedEmails.length === 0 && (
                <p className="text-xs text-text-muted italic">No email accounts connected yet.</p>
              )}
              {connectedEmails.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border border-card-border rounded-xl flex items-center justify-between text-xs bg-background/20"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base flex-shrink-0">📧</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary truncate">{item.email}</p>
                      <p className="text-[10px] text-text-muted font-mono mt-0.5">
                        Connected via{' '}
                        <span className="text-brand-orange">{providerLabel(item.provider)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[9px] font-bold border border-green-500/20 rounded font-mono">
                      ACTIVE
                    </span>
                    <button
                      onClick={() => handleDeleteEmail(item.id)}
                      className="p-1 hover:bg-brand-red/10 text-text-muted hover:text-brand-red rounded"
                      title="Disconnect Account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Provider status badges */}
            {providerStatus !== null && (
              <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${providerStatus.gmail ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                  {providerStatus.gmail ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  Gmail OAuth {providerStatus.gmail ? 'configured' : 'not configured'}
                </span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded border font-semibold ${providerStatus.outlook ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
                  {providerStatus.outlook ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  Outlook OAuth {providerStatus.outlook ? 'configured' : 'not configured'}
                </span>
              </div>
            )}

            {/* Not-configured warning */}
            {providerStatus !== null && (!providerStatus.gmail || !providerStatus.outlook) && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">OAuth credentials missing</p>
                  {!providerStatus.gmail && (
                    <p className="text-amber-400/80 font-mono text-[10px]">Gmail: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in .env.local</p>
                  )}
                  {!providerStatus.outlook && (
                    <p className="text-amber-400/80 font-mono text-[10px]">Outlook: set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI in .env.local</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleConnectGmail}
                disabled={providerStatus !== null && !providerStatus.gmail}
                title={providerStatus !== null && !providerStatus.gmail ? 'Gmail OAuth not configured — set env vars first' : undefined}
                className="px-3 py-1.5 border border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/15 text-blue-500 text-xs font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                + Connect Gmail
              </button>
              <button
                onClick={handleConnectOutlook}
                disabled={providerStatus !== null && !providerStatus.outlook}
                title={providerStatus !== null && !providerStatus.outlook ? 'Outlook OAuth not configured — set env vars first' : undefined}
                className="px-3 py-1.5 border border-indigo-500/30 hover:border-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/15 text-indigo-500 text-xs font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                + Connect Outlook
              </button>
              <button
                onClick={() => setShowManualForm(!showManualForm)}
                className="px-3 py-1.5 border border-brand-orange/30 hover:border-brand-orange bg-brand-orange/5 hover:bg-brand-orange/15 text-brand-orange text-xs font-semibold rounded-lg transition-all active:scale-95"
              >
                + Connect Roundcube (IMAP)
              </button>
            </div>

            {showManualForm && (
              <form
                onSubmit={handleConnectManual}
                className="border border-card-border rounded-xl p-4 bg-background/30 space-y-3.5 text-xs animate-in slide-in-from-top-2 duration-150"
              >
                <h4 className="font-display font-semibold text-text-primary">Manual Server Settings</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="user@customdomain.com"
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      IMAP Server
                    </label>
                    <input
                      type="text"
                      placeholder="mail.domain.com"
                      value={imapServer}
                      onChange={(e) => setImapServer(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      IMAP Port
                    </label>
                    <input
                      type="text"
                      value={imapPort}
                      onChange={(e) => setImapPort(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      SMTP Server
                    </label>
                    <input
                      type="text"
                      placeholder="smtp.domain.com"
                      value={smtpServer}
                      onChange={(e) => setSmtpServer(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      SMTP Port
                    </label>
                    <input
                      type="text"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold font-mono text-text-muted uppercase">
                      Password
                    </label>
                    <input
                      type="password"
                      value={mailPassword}
                      onChange={(e) => setMailPassword(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1 focus:outline-none focus:border-brand-red"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="px-3 py-1.5 border border-card-border rounded-lg text-[10px] font-bold font-mono hover:bg-card-border/30 text-text-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-[10px] font-bold font-mono rounded-lg shadow-sm disabled:opacity-60"
                  >
                    {isConnecting ? 'Verifying...' : 'Save and Connect'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-gold" />
            <span>Notification Preferences</span>
          </h3>
          <p className="text-[11px] text-text-muted font-mono">Toggle which events trigger in-app notifications. "Always on" events cannot be disabled.</p>
          <div className="space-y-2">
            {NOTIF_EVENTS.map(({ key, label, always }) => {
              const enabled = isNotifEnabled(key);
              return (
                <div key={key} className="flex items-center justify-between py-1.5 border-b border-card-border/40 last:border-0">
                  <div>
                    <span className="text-xs text-text-primary font-medium">{label}</span>
                    {always && <span className="ml-2 text-[9px] font-mono text-brand-gold bg-brand-gold/10 px-1.5 py-0.5 rounded">Always on</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleNotif(key, always)}
                    disabled={always}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-70 ${enabled ? 'bg-brand-red' : 'bg-card-border'}`}
                    aria-pressed={enabled}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin Panel */}
        <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-sm text-text-primary flex items-center gap-2">
            <Key className="w-4 h-4 text-brand-red" />
            <span>Admin Control Panel</span>
          </h3>

          {currentRole === 'director' ? (
            <div className="space-y-6 text-xs animate-in fade-in duration-200">

              {/* User Management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-text-primary flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    User Management
                  </h4>
                  <button
                    onClick={() => setShowNewUserForm((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-brand-red hover:text-brand-orange font-mono transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add User
                  </button>
                </div>

                {showNewUserForm && (
                  <form onSubmit={handleCreateUser} className="bg-background border border-card-border rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={newUserFirst} onChange={(e) => setNewUserFirst(e.target.value)} placeholder="First name" required
                        className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                      <input value={newUserLast} onChange={(e) => setNewUserLast(e.target.value)} placeholder="Last name" required
                        className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                    </div>
                    <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} type="email" placeholder="Email address" required
                      className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                    <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red">
                      <option value="sdr">SDR</option>
                      <option value="leadgen">Leadgen</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="floor_manager">Floor Manager</option>
                      <option value="director">Director</option>
                    </select>
                    <p className="text-[10px] text-text-muted font-mono">Temp password: <span className="text-brand-orange">Telestar2026!</span> — user must change on first login.</p>
                    <div className="flex gap-2">
                      <button type="submit" disabled={savingUser}
                        className="flex-1 py-1.5 bg-brand-red hover:bg-brand-orange text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                        {savingUser && <Loader2 className="w-3 h-3 animate-spin" />}Create User
                      </button>
                      <button type="button" onClick={() => setShowNewUserForm(false)}
                        className="px-3 py-1.5 border border-card-border text-text-muted hover:text-text-primary rounded-lg transition-colors">Cancel</button>
                    </div>
                  </form>
                )}

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {adminUsers.map((u) => (
                    <div key={u.id} className={`rounded-lg border ${u.isActive ? 'border-card-border bg-background/40' : 'border-card-border/40 bg-card-border/10 opacity-60'}`}>
                      <div className="flex items-center justify-between p-2">
                        <div>
                          <span className="font-semibold text-text-primary">{u.firstName} {u.lastName}</span>
                          <span className="text-text-muted ml-2 font-mono text-[10px]">{u.role.replace('_', ' ')}</span>
                          {!u.isActive && <span className="ml-2 text-[9px] font-mono text-brand-red">DEACTIVATED</span>}
                        </div>
                        {u.isActive && (
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => (editingUserId === u.id ? setEditingUserId(null) : handleStartEditUser(u))}
                              className="text-text-muted hover:text-brand-orange transition-colors p-1 rounded" title="Edit user">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeactivateUser(u.id, `${u.firstName} ${u.lastName}`)}
                              className="text-text-muted hover:text-brand-red transition-colors p-1 rounded" title="Deactivate user">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {editingUserId === u.id && (
                        <div className="border-t border-card-border/60 p-2.5 space-y-2 bg-card-bg/60">
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editFirst} onChange={(e) => setEditFirst(e.target.value)} placeholder="First name"
                              className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                            <input value={editLast} onChange={(e) => setEditLast(e.target.value)} placeholder="Last name"
                              className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                          </div>
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                            className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red">
                            <option value="sdr">SDR</option>
                            <option value="leadgen">Leadgen</option>
                            <option value="team_lead">Team Lead</option>
                            <option value="floor_manager">Floor Manager</option>
                            <option value="director">Director</option>
                          </select>
                          <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} autoComplete="new-password"
                            placeholder="Reset password (optional, 8+ chars)"
                            className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEditUser(u.id)} disabled={savingEdit}
                              className="flex-1 py-1.5 bg-brand-red hover:bg-brand-orange text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                              {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}Save Changes
                            </button>
                            <button onClick={() => setEditingUserId(null)}
                              className="px-3 py-1.5 border border-card-border text-text-muted hover:text-text-primary rounded-lg transition-colors">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {adminUsers.length === 0 && <p className="text-text-muted font-mono text-[11px]">No users loaded.</p>}
                </div>
              </div>

              {/* Campaign Management */}
              <div className="space-y-2.5 border-t border-card-border/50 pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-text-primary">Campaigns</h4>
                  <button onClick={() => setShowNewCampaignForm((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-semibold text-brand-red hover:text-brand-orange font-mono transition-colors">
                    <Plus className="w-3 h-3" /> Add Campaign
                  </button>
                </div>

                {showNewCampaignForm && (
                  <form onSubmit={handleCreateCampaign} className="bg-background border border-card-border rounded-xl p-3 space-y-2">
                    <input value={campName} onChange={(e) => setCampName(e.target.value)} placeholder="Campaign name" required
                      className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                    <select value={campClientId} onChange={(e) => setCampClientId(e.target.value)}
                      className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red">
                      <option value="">+ New client…</option>
                      {clientOptions.map((cl) => (<option key={cl.id} value={cl.id}>{cl.name}</option>))}
                    </select>
                    {!campClientId && (
                      <input value={campNewClient} onChange={(e) => setCampNewClient(e.target.value)} placeholder="New client name"
                        className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input value={campVertical} onChange={(e) => setCampVertical(e.target.value)} placeholder="Vertical (optional)"
                        className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                      <input value={campGeo} onChange={(e) => setCampGeo(e.target.value)} placeholder="Geo (optional)"
                        className="bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                    </div>
                    <select value={campStatus} onChange={(e) => setCampStatus(e.target.value)}
                      className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red">
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </select>
                    <div className="flex gap-2">
                      <button type="submit" disabled={savingCampaign}
                        className="flex-1 py-1.5 bg-brand-red hover:bg-brand-orange text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                        {savingCampaign && <Loader2 className="w-3 h-3 animate-spin" />}Create Campaign
                      </button>
                      <button type="button" onClick={() => setShowNewCampaignForm(false)}
                        className="px-3 py-1.5 border border-card-border text-text-muted hover:text-text-primary rounded-lg transition-colors">Cancel</button>
                    </div>
                  </form>
                )}

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {adminClients.map((c: any) => (
                    <div key={c.id} className="rounded-lg border border-card-border bg-background/40">
                      <div className="flex items-center justify-between p-2">
                        <div className="min-w-0">
                          <span className="text-text-primary font-semibold truncate">{c.name}</span>
                          {c.client?.name && <span className="text-text-muted ml-2 font-mono text-[10px]">{c.client.name}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${c.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : c.status === 'paused' ? 'bg-amber-500/10 text-amber-500' : 'bg-card-border text-text-muted'}`}>{c.status}</span>
                          <button onClick={() => (editingCampaignId === c.id ? setEditingCampaignId(null) : handleStartEditCampaign(c))}
                            className="text-text-muted hover:text-brand-orange transition-colors p-1 rounded" title="Edit campaign">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {editingCampaignId === c.id && (
                        <div className="border-t border-card-border/60 p-2.5 space-y-2 bg-card-bg/60">
                          <input value={editCampName} onChange={(e) => setEditCampName(e.target.value)} placeholder="Campaign name"
                            className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editCampVertical} onChange={(e) => setEditCampVertical(e.target.value)} placeholder="Vertical"
                              className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                            <input value={editCampGeo} onChange={(e) => setEditCampGeo(e.target.value)} placeholder="Geo"
                              className="bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red" />
                          </div>
                          <select value={editCampStatus} onChange={(e) => setEditCampStatus(e.target.value)}
                            className="w-full bg-background border border-card-border rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-brand-red">
                            <option value="active">Active</option>
                            <option value="paused">Paused</option>
                            <option value="completed">Completed</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEditCampaign(c.id)} disabled={savingCampaignEdit}
                              className="flex-1 py-1.5 bg-brand-red hover:bg-brand-orange text-white font-bold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1">
                              {savingCampaignEdit && <Loader2 className="w-3 h-3 animate-spin" />}Save Changes
                            </button>
                            <button onClick={() => setEditingCampaignId(null)}
                              className="px-3 py-1.5 border border-card-border text-text-muted hover:text-text-primary rounded-lg transition-colors">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {adminClients.length === 0 && <p className="text-text-muted font-mono text-[11px]">No campaigns yet.</p>}
                </div>
              </div>

              {/* Team & Accounts assignment (org-wide for director) */}
              <div className="border-t border-card-border/50 pt-4">
                <TeamAccountsPanel />
              </div>

              {/* Data Export */}
              <div className="border-t border-card-border/50 pt-4 space-y-2.5">
                <h4 className="font-bold text-text-primary">Data Export</h4>
                {/* Format toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-text-muted uppercase">Format</span>
                  <div className="flex bg-card-border rounded-lg p-0.5 gap-0.5">
                    {(['csv', 'json'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setExportFormat(fmt)}
                        className={`px-3 py-1 rounded text-[10px] font-bold font-mono uppercase transition-all ${exportFormat === fmt ? 'bg-brand-red text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Date range */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-text-muted uppercase block">From (optional)</label>
                    <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-mono text-[11px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold font-mono text-text-muted uppercase block">To (optional)</label>
                    <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)}
                      className="w-full bg-background border border-card-border rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-brand-red font-mono text-[11px]" />
                  </div>
                </div>
                <button onClick={handleExportAllData} disabled={exportingData}
                  className="w-full py-2 border border-card-border hover:border-brand-orange bg-background hover:bg-brand-orange/5 text-text-primary text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-60">
                  {exportingData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-brand-orange" />}
                  Export Leads as {exportFormat.toUpperCase()}
                </button>
              </div>

              {/* Seed / Reset */}
              <div className="border-t border-card-border/50 pt-4 space-y-2">
                <h4 className="font-bold text-text-primary">Demo Data</h4>
                <button
                  onClick={async () => {
                    const res = await fetch('/api/seed', { method: 'POST' });
                    if (res.ok) showToast('Demo data reset! Refresh to see clean state.', 'success');
                    else showToast('Failed to reset demo data', 'error');
                  }}
                  className="w-full py-2 border border-brand-red/30 hover:border-brand-red bg-brand-red/5 hover:bg-brand-red/10 text-brand-red text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Re-Seed Showcase Demo Data
                </button>
              </div>
            </div>
          ) : currentRole === 'floor_manager' || currentRole === 'leadgen' ? (
            <div className="animate-in fade-in duration-200">
              <TeamAccountsPanel />
            </div>
          ) : (
            <div className="p-4 bg-brand-red/5 border border-brand-red/10 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-brand-red font-semibold">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>Console Blocked</span>
              </div>
              <p className="text-[11px] text-text-secondary leading-normal">
                User management, BPO client integrations, and platform seeds are locked for your role.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
