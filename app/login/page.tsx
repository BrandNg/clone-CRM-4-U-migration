'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Flame, Mail, Lock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Director', name: 'Dean', email: 'dean@telestar.vn', role: 'director' },
  { label: 'Floor Manager', name: 'Sonny', email: 'sonny@telestar.vn', role: 'floor_manager' },
  { label: 'Floor Manager', name: 'Alayna', email: 'alayna@telestar.vn', role: 'floor_manager' },
  { label: 'Team Lead', name: 'Brandon', email: 'brandon@telestar.vn', role: 'team_lead' },
  { label: 'SDR', name: 'Lan Pham', email: 'lan.pham@telestar.vn', role: 'sdr' },
  { label: 'Leadgen', name: 'Dominic', email: 'dominic@telestar.vn', role: 'leadgen' },
] as const;

const ROLE_COLORS: Record<string, string> = {
  director: 'border-brand-red/40 bg-brand-red/5 text-brand-red hover:bg-brand-red/10',
  floor_manager: 'border-brand-orange/40 bg-brand-orange/5 text-brand-orange hover:bg-brand-orange/10',
  team_lead: 'border-amber-500/40 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10',
  sdr: 'border-card-border bg-background text-text-secondary hover:bg-card-bg',
  leadgen: 'border-purple-500/40 bg-purple-500/5 text-purple-400 hover:bg-purple-500/10',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(true);

  const doSignIn = async (e: string, p: string) => {
    setLoading(true);
    setError('');
    const result = await signIn('credentials', { email: e, password: p, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError('Invalid email or password.');
    } else {
      router.push('/');
      router.refresh();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSignIn(email, password);
  };

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm py-8">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-red/10 border border-brand-red/20 mb-4">
            <Flame className="w-7 h-7 text-brand-red" />
          </div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
            Telestar CRM
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            SDR Operations Platform
          </p>
        </div>

        {/* Demo Accounts panel — dev/showcase only; tree-shaken out of the production
            bundle so it can never expose one-click admin sign-in in production. */}
        {process.env.NODE_ENV !== 'production' && (
        <div className="mb-4 bg-card-bg border border-card-border rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDemo(!showDemo)}
            className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-bold font-mono text-text-muted uppercase tracking-widest hover:bg-background/40 transition-colors"
          >
            <span>⚡ Demo Accounts — click to sign in</span>
            {showDemo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDemo && (
            <div className="px-3 pb-3 space-y-1.5 border-t border-card-border/60 pt-3">
              <p className="text-[10px] text-text-muted text-center mb-2">
                Password for all accounts: <span className="font-mono text-text-secondary">telestar2026</span>
              </p>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={loading}
                  onClick={() => doSignIn(account.email, 'telestar2026')}
                  className={`w-full py-2 px-3 border rounded-xl text-xs font-semibold transition-colors flex items-center justify-between disabled:opacity-50 ${ROLE_COLORS[account.role]}`}
                >
                  <span>{account.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] opacity-70">{account.email}</span>
                    <span className="opacity-60 text-[10px] border border-current/20 rounded px-1.5 py-0.5">{account.label}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Login card */}
        <div className="bg-card-bg border border-card-border rounded-2xl p-6 shadow-lg">
          <h2 className="font-display font-bold text-sm text-text-primary mb-5">
            Sign in with your account
          </h2>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 bg-brand-red/5 border border-brand-red/20 rounded-xl text-xs text-brand-red">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@telestar.vn"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-card-border rounded-xl text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold font-mono text-text-muted uppercase block">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-4 py-2.5 bg-background border border-card-border rounded-xl text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-brand-red transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-red hover:bg-brand-red-hover disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <p className="text-center text-[10px] text-text-muted mt-5 leading-relaxed">
            No self-registration. Contact your Director to get access.
          </p>
        </div>
      </div>
    </div>
  );
}
