'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAppContext } from '@/context/AppContext';
import { Database, Mail, Upload, Activity } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentRole, isSessionLoading } = useAppContext();
  const router = useRouter();
  const pathname = usePathname();

  // Fence admin routes to director or floor_manager roles only.
  useEffect(() => {
    if (!isSessionLoading && currentRole && currentRole !== 'director' && currentRole !== 'floor_manager') {
      router.replace('/');
    }
  }, [isSessionLoading, currentRole, router]);

  if (isSessionLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="text-text-muted text-xs font-mono animate-pulse">Checking credentials...</div>
      </div>
    );
  }

  if (currentRole !== 'director' && currentRole !== 'floor_manager') {
    return null;
  }

  const tabs = [
    { name: 'Job Runs', href: '/admin/jobs', icon: Database },
    { name: 'Outbound Emails', href: '/admin/outbound', icon: Mail },
    { name: 'CSV Imports', href: '/admin/imports', icon: Upload },
    { name: 'Worker Health', href: '/admin/worker-health', icon: Activity },
  ];

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Header */}
      <div className="page-hero">
        <h1 className="font-display font-extrabold text-2xl text-text-primary">System Administration</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Monitor background worker queues, outbound delivery logs, duplicate check logs, and core infrastructure health.
        </p>
      </div>

      {/* Admin Sub-navigation */}
      <div className="flex border-b border-card-border bg-background/25 rounded-xl p-1.5 gap-1 self-start shrink-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          const Icon = tab.icon;

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                isActive
                  ? 'bg-brand-red text-white shadow-md shadow-brand-red/10'
                  : 'text-text-muted hover:text-text-primary hover:bg-card-border/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}
