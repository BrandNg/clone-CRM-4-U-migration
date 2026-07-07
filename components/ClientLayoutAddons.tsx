'use client';

import dynamic from 'next/dynamic';

const CommandPalette = dynamic(() => import('@/components/CommandPalette'), { ssr: false });
const AiAssistant = dynamic(() => import('@/components/AiAssistant'), { ssr: false });

export default function ClientLayoutAddons() {
  return (
    <>
      <CommandPalette />
      <AiAssistant />
    </>
  );
}
