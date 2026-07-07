'use client';

import { useEffect, useState } from 'react';

// Telestar CRM is desktop-only; this is the single source of truth for "are we
// on a desktop-sized viewport" used by the gate and by the floating chrome
// (AI assistant, command palette) so nothing renders over the desktop-only notice.
export const MIN_DESKTOP_WIDTH = 1024;

/**
 * Returns whether the viewport is at least desktop width. SSR-safe: starts `true`
 * (so server and first client render match) and corrects after mount via matchMedia.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MIN_DESKTOP_WIDTH}px)`);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
