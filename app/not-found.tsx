import Link from 'next/link';
import { Flame } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-red/10 border border-brand-red/20 mb-4">
          <Flame className="w-7 h-7 text-brand-red" />
        </div>
        <h1 className="font-display font-extrabold text-5xl text-text-primary mb-2 tracking-tight">
          404
        </h1>
        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          This page doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-bold rounded-xl shadow-sm transition-colors active:scale-95"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
