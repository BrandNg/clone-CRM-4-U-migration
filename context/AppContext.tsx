'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export type UserRole = 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';

interface AppContextType {
  currentRole: UserRole;
  setRole: (role: UserRole) => void;
  currentUserId: string;
  currentUser: { firstName: string; lastName: string; email: string } | null;
  isManager: boolean;
  isLeadgenManager: boolean;
  activeNewModal: 'lead' | 'task' | 'reminder' | 'campaign' | null;
  setActiveNewModal: (type: 'lead' | 'task' | 'reminder' | 'campaign' | null) => void;
  isSessionLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  // The real role comes from the session; the demo switcher can override it
  // for managers who want to see the SDR perspective.
  const sessionRole = (session?.user as any)?.role as UserRole | undefined;
  const [overrideRole, setOverrideRole] = useState<UserRole | null>(null);

  const [activeNewModal, setActiveNewModal] = useState<'lead' | 'task' | 'reminder' | 'campaign' | null>(null);

  // When the session role changes, clear any override
  useEffect(() => {
    setOverrideRole(null);
  }, [sessionRole]);

  const currentRole: UserRole = overrideRole ?? sessionRole ?? 'sdr';
  const currentUserId: string = (session?.user as any)?.id ?? '';
  const isManager: boolean = currentRole !== 'sdr' && currentRole !== 'leadgen';
  const isLeadgenManager: boolean =
    currentRole === 'leadgen' &&
    (sessionRole === 'director' ||
      sessionRole === 'floor_manager' ||
      (sessionRole === 'leadgen' && !!(session?.user as any)?.isManager));

  const currentUser = session?.user
    ? {
        firstName: (session.user as any).firstName ?? '',
        lastName: (session.user as any).lastName ?? '',
        email: session.user.email ?? '',
      }
    : null;

  const setRole = (role: UserRole) => {
    if (sessionRole === 'director' || sessionRole === 'floor_manager') {
      setOverrideRole(role);
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        setRole,
        currentUserId,
        currentUser,
        isManager,
        isLeadgenManager,
        activeNewModal,
        setActiveNewModal,
        isSessionLoading: status === 'loading',
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
}
