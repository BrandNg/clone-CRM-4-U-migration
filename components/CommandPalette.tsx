'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import {
  Search,
  Users,
  Sparkles,
  ChevronRight,
  Flame,
  LayoutDashboard
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
interface Lead { id: string; firstName: string; lastName: string; company: string; }
import LeadDetailPanel from './LeadDetailPanel';

interface CommandItem {
  id: string;
  name: string;
  category: string;
  shortcut?: string;
  action: () => void;
  icon: React.ReactNode;
}

export default function CommandPalette() {
  const router = useRouter();
  const { setRole } = useAppContext();
  const isDesktop = useIsDesktop();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadResults, setLeadResults] = useState<Lead[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Setup Hotkey + custom event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
        setActiveIndex(0);
        return;
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleOpen = () => {
      setIsOpen(true);
      setQuery('');
      setActiveIndex(0);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('telestar:open-command-palette', handleOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('telestar:open-command-palette', handleOpen);
    };
  }, []);

  // Autofocus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const commandItems: CommandItem[] = [
    { id: 'go_dash', name: 'Go to Tasks Dashboard', category: 'Navigation', shortcut: 'G D', icon: <LayoutDashboard className="w-4 h-4 text-brand-red" />, action: () => router.push('/') },
    { id: 'go_leads', name: 'Go to Leads Pipeline', category: 'Navigation', shortcut: 'G L', icon: <Users className="w-4 h-4 text-blue-500" />, action: () => router.push('/leads') },
    { id: 'go_seq', name: 'Go to Drip Sequences', category: 'Navigation', shortcut: 'G S', icon: <Sparkles className="w-4 h-4 text-brand-orange" />, action: () => router.push('/sequences') },
    { id: 'role_dir', name: 'Simulate Director Profile (Unlock Team)', category: 'Persona Scoping', icon: <Flame className="w-4 h-4 text-brand-red" />, action: () => setRole('director') },
    { id: 'role_sdr', name: 'Simulate SDR Profile (Lock Team)', category: 'Persona Scoping', icon: <Flame className="w-4 h-4 text-brand-orange" />, action: () => setRole('sdr') },
  ];

  // Search through commands and leads
  const matchedCommands = commandItems.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase()) || 
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (query.trim().length < 2) { setLeadResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/leads?search=${encodeURIComponent(query)}&limit=5`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setLeadResults(Array.isArray(data) ? data.slice(0, 5) : []))
        .catch(() => setLeadResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const matchedLeads = leadResults;

  const totalResults = [...matchedCommands, ...matchedLeads];

  // Keyboard Navigation inside Command list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalResults.length > 0) setActiveIndex(prev => (prev + 1) % totalResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalResults.length > 0) setActiveIndex(prev => (prev - 1 + totalResults.length) % totalResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (totalResults[activeIndex]) {
        executeResult(totalResults[activeIndex]);
      }
    }
  };

  const executeResult = (item: any) => {
    if (item.action) {
      // It is a command
      item.action();
    } else {
      // It is a lead object
      setSelectedLeadId((item as Lead).id);
    }
    setIsOpen(false);
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  // Desktop-only app: don't mount the command palette (or its slide-over host) on
  // small screens, where the DesktopOnlyGate notice is showing instead of the app.
  if (!isDesktop) return null;

  if (!isOpen) {
    return (
      <LeadDetailPanel 
        leadId={selectedLeadId} 
        onClose={() => setSelectedLeadId(null)} 
      />
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Main Dialog container */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 pointer-events-none">
        <div 
          onKeyDown={handleKeyDown}
          className="pointer-events-auto w-full max-w-lg bg-card-bg/95 border border-card-border shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 glassmorphism"
        >
          {/* Input field */}
          <div className="flex items-center gap-3 px-4 border-b border-card-border h-12.5 bg-background/30">
            <Search className="w-4.5 h-4.5 text-text-muted" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search leads, commands, theme switchers..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              className="flex-1 bg-transparent border-0 text-xs text-text-primary placeholder-text-muted focus:outline-none h-full"
            />
            <span className="inline-block px-1.5 py-0.5 border border-card-border bg-background rounded text-[9px] font-mono text-text-muted">
              ESC
            </span>
          </div>

          {/* Results list */}
          <div 
            ref={listRef}
            className="max-h-72 overflow-y-auto p-2 space-y-0.5 divide-y divide-card-border/10"
          >
            {totalResults.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                No matching commands or leads found.
              </div>
            ) : (
              totalResults.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isCommand = 'category' in item;

                return (
                  <button
                    key={item.id}
                    onClick={() => executeResult(item)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-colors flex items-center justify-between gap-3 ${
                      isActive ? 'bg-brand-red text-white' : 'text-text-primary hover:bg-background'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center bg-card-border/30 ${
                        isActive ? 'text-white' : 'text-text-secondary'
                      }`}>
                        {isCommand ? item.icon : '👤'}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-semibold truncate ${isActive ? 'text-white' : 'text-text-primary'}`}>
                          {isCommand ? item.name : `${item.firstName} ${item.lastName}`}
                        </p>
                        <p className={`text-[9px] uppercase font-bold font-mono tracking-wider ${
                          isActive ? 'text-white/80' : 'text-text-muted'
                        }`}>
                          {isCommand ? item.category : `Lead at ${item.company}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCommand && item.shortcut && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono ${
                          isActive ? 'bg-white/20 text-white' : 'bg-card-border/60 text-text-muted'
                        }`}>
                          {item.shortcut}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-white animate-pulse" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Guide bar */}
          <div className="px-4 py-2 border-t border-card-border bg-background/50 flex justify-between text-[9px] font-mono text-text-muted">
            <div className="flex gap-2">
              <span>↑↓ to navigate</span>
              <span>·</span>
              <span>↵ to select</span>
            </div>
            <span>Press Ctrl+K to close</span>
          </div>

        </div>
      </div>

      {/* Detail Panel slide-over overlay (accessible after select) */}
      <LeadDetailPanel 
        leadId={selectedLeadId} 
        onClose={() => setSelectedLeadId(null)} 
      />
    </>
  );
}
