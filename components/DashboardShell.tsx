'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import DesktopOnlyGate from './DesktopOnlyGate';

const NewLeadModal = dynamic(() => import('./NewLeadModal'), { ssr: false });
const NewTaskModal = dynamic(() => import('./NewTaskModal'), { ssr: false });
const NewReminderModal = dynamic(() => import('./NewReminderModal'), { ssr: false });
const NewCampaignModal = dynamic(() => import('./NewCampaignModal'), { ssr: false });
import { useAppContext } from '@/context/AppContext';

// Keep the Neon DB warm while the app is actively in use. Pinging every 4 minutes
// stays under the free-tier 5-minute auto-suspend window, so the first query after
// idle doesn't pay a cold-start penalty. Only fires while the tab is visible, so a
// backgrounded tab doesn't burn compute hours overnight — the DB suspends when the
// team stops working and wakes on the first load the next morning.
const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { currentRole, setRole, setActiveNewModal, activeNewModal } = useAppContext();
  const pathname = usePathname();

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/health', { cache: 'no-store' }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  if (pathname === '/login') {
    return <DesktopOnlyGate>{children}</DesktopOnlyGate>;
  }

  return (
    <DesktopOnlyGate>
    <div className="min-h-screen flex bg-bg-main text-text-main transition-colors duration-200">
      <Sidebar userRole={currentRole} />

      <div className="flex-1 flex flex-col min-w-0" style={{ paddingLeft: 'var(--sidebar-w, 56px)' }}>
        <Topbar
          currentRole={currentRole}
          onRoleChange={setRole}
          onNewAction={(type) => setActiveNewModal(type as any)}
        />

        <main className="flex-1 pt-16 p-6 min-h-[calc(100vh-4rem)] flex flex-col aurora-bg">
          {children}
        </main>
      </div>

      {activeNewModal === 'lead' && (
        <NewLeadModal
          onClose={() => setActiveNewModal(null)}
          onSuccess={() => {
            setActiveNewModal(null);
            window.dispatchEvent(new CustomEvent('crm:lead-created'));
          }}
        />
      )}
      {activeNewModal === 'task' && (
        <NewTaskModal
          onClose={() => setActiveNewModal(null)}
          onSuccess={() => {
            setActiveNewModal(null);
            window.dispatchEvent(new CustomEvent('crm:task-created'));
          }}
        />
      )}
      {activeNewModal === 'reminder' && (
        <NewReminderModal onClose={() => setActiveNewModal(null)} />
      )}
      {activeNewModal === 'campaign' && (
        <NewCampaignModal onClose={() => setActiveNewModal(null)} />
      )}
    </div>
    </DesktopOnlyGate>
  );
}
