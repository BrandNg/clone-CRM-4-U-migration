'use client';

import React from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';

// Telestar CRM is a desktop-only internal tool. Below the desktop width we block
// the app with a notice instead of rendering a layout that was never designed to reflow.
export default function DesktopOnlyGate({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-brand-dark px-8 text-center text-white">
      <div className="flex items-center justify-center bg-brand-red/10 rounded-2xl p-4 text-brand-red logo-glow">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-12 h-12 text-brand-red drop-shadow-[0_0_8px_rgba(212,43,30,0.6)]"
          aria-hidden="true"
        >
          <path d="M12 2L14.73 8.35L21.6 9L16.42 13.56L17.95 20.3L12 16.72L6.05 20.3L7.58 13.56L2.4 9L9.27 8.35L12 2Z" />
        </svg>
      </div>
      <div className="space-y-2 max-w-sm">
        <h1 className="font-display font-extrabold text-2xl tracking-wide bg-gradient-to-r from-brand-red via-brand-orange to-brand-gold bg-clip-text text-transparent">
          TELESTAR CRM
        </h1>
        <p className="text-sm text-white/80 leading-relaxed">
          Telestar CRM is built for desktop. Please open it on a screen at least
          1024px wide to keep your workflow fast and dense.
        </p>
      </div>
    </div>
  );
}
