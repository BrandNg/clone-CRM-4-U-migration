'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Repeat,
  FileText,
  BarChart3,
  Settings,
  Target,
  TrendingUp,
  Cpu,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

interface SidebarProps {
  userRole?: 'director' | 'floor_manager' | 'team_lead' | 'sdr' | 'leadgen';
}

const EXPANDED_KEY = 'telestar-sidebar-expanded';
const W_EXPANDED = '192px';
const W_COLLAPSED = '56px';

export default function Sidebar({ userRole = 'sdr' }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser, isManager, isLeadgenManager } = useAppContext();

  const [expanded, setExpanded] = useState(false);

  // Load persisted state after mount and sync CSS variable
  useEffect(() => {
    const saved = localStorage.getItem(EXPANDED_KEY) === 'true';
    setExpanded(saved);
    document.documentElement.style.setProperty('--sidebar-w', saved ? W_EXPANDED : W_COLLAPSED);
  }, []);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem(EXPANDED_KEY, String(next));
    document.documentElement.style.setProperty('--sidebar-w', next ? W_EXPANDED : W_COLLAPSED);
  };

  // Leadgen gets its own focused environment; everyone else gets the standard shell.
  const navItems = userRole === 'leadgen'
    ? [
        { name: 'Leadgen', href: '/leadgen', icon: Target },
        { name: 'Settings', href: '/settings', icon: Settings },
      ]
    : [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        ...(userRole === 'director' ? [{ name: 'Director', href: '/director', icon: Briefcase }] : []),
        ...(userRole === 'director' || userRole === 'floor_manager' ? [{ name: 'Admin', href: '/admin/jobs', icon: Shield }] : []),
        { name: 'Leads', href: '/leads', icon: Users },
        { name: 'Sequences', href: '/sequences', icon: Repeat },
        { name: 'Performance', href: '/sequences/performance', icon: TrendingUp },
        { name: 'Templates', href: '/templates', icon: FileText },
        ...(isManager ? [{ name: 'Team View', href: '/team', icon: BarChart3 }] : []),
        ...(isManager ? [{ name: 'Automation', href: '/automation', icon: Cpu }] : []),
        { name: 'Settings', href: '/settings', icon: Settings },
      ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-20 flex flex-col glass-sidebar border-r border-sidebar-border text-sidebar-text sidebar-transition ${expanded ? 'w-48' : 'w-14'}`}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-3 py-5 border-b border-sidebar-border h-16 overflow-hidden">
        <div className="flex items-center justify-center bg-brand-red/10 rounded-lg p-1.5 text-brand-red logo-glow flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6 text-brand-red drop-shadow-[0_0_8px_rgba(212,43,30,0.6)]"
          >
            <path d="M12 2L14.73 8.35L21.6 9L16.42 13.56L17.95 20.3L12 16.72L6.05 20.3L7.58 13.56L2.4 9L9.27 8.35L12 2Z" />
            <path
              d="M12 17.5C12 17.5 14.5 13 14.5 11C14.5 9 12 6.5 12 6.5C12 6.5 9.5 9 9.5 11C9.5 13 12 17.5 12 17.5Z"
              fill="url(#flameGrad)"
              opacity="0.9"
            />
            <defs>
              <linearGradient id="flameGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#E8611A" />
                <stop offset="100%" stopColor="#FEDD44" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        {expanded && (
          <span className="font-display font-extrabold text-base tracking-wide bg-gradient-to-r from-brand-red via-brand-orange to-brand-gold bg-clip-text text-transparent whitespace-nowrap">
            TELESTAR
          </span>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative focus-ring ${
                isActive
                  ? 'bg-brand-red/15 text-white font-semibold shadow-md shadow-brand-red/10 border-beam-container'
                  : 'text-sidebar-text-muted hover:bg-sidebar-border hover:text-sidebar-text'
              }`}
            >
              {isActive && <span className="sidebar-beam-indicator" aria-hidden="true" />}
              <Icon
                aria-hidden="true"
                className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                  isActive
                    ? 'text-white drop-shadow-[0_0_6px_rgba(212,43,30,0.4)]'
                    : 'text-sidebar-text-muted group-hover:text-sidebar-text'
                }`}
              />

              {expanded ? (
                <span className="truncate">{item.name}</span>
              ) : (
                <div
                  role="tooltip"
                  className="absolute left-14 hidden group-hover:flex bg-brand-dark text-white text-xs py-1 px-2.5 rounded border border-sidebar-border whitespace-nowrap shadow-md z-30 pointer-events-none"
                >
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-2">
        <button
          onClick={toggleExpanded}
          className="flex items-center justify-center w-8 h-8 rounded-lg mx-auto text-sidebar-text-muted hover:text-sidebar-text hover:bg-sidebar-border transition-colors"
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {/* User Footer */}
      <div
        className="p-3 border-t border-sidebar-border flex items-center gap-3 bg-sidebar-bg/50 overflow-hidden"
        aria-label={
          currentUser
            ? `Logged in as ${[currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ')}, role: ${userRole}`
            : `Current role: ${userRole}`
        }
      >
        <div className="w-9 h-9 rounded-full bg-sidebar-border border border-sidebar-border flex items-center justify-center font-bold text-xs text-brand-orange uppercase flex-shrink-0">
          {currentUser
            ? `${currentUser.firstName[0] || ''}${currentUser.lastName[0] || ''}`
            : userRole === 'director'
            ? 'SN'
            : '??'}
        </div>
        {expanded && (
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-sidebar-text truncate">
              {currentUser
                ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ')
                : 'Loading...'}
            </span>
            <span className="text-[10px] text-sidebar-text-muted font-mono tracking-tighter truncate uppercase">
              {isLeadgenManager ? 'leadgen manager' : userRole.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
