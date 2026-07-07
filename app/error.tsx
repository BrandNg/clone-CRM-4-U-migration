'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-red/10 border border-brand-red/20 mb-4">
          <AlertTriangle className="w-7 h-7 text-brand-red" />
        </div>
        <h1 className="font-display font-bold text-lg text-text-primary mb-2">
          Something went wrong
        </h1>
        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          {error.digest
            ? `An unexpected error occurred. Reference: ${error.digest}`
            : 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-red hover:bg-brand-red-hover text-white text-xs font-bold rounded-xl shadow-sm transition-colors active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
